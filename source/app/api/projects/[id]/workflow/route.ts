import {env} from '@/lib/deployment/runtime-env';
import {QwenEmbedding,retrieveSemanticEvidence} from '@/lib/research/semantic-retrieval';
import {saveOpportunityDraft} from '@/lib/research/opportunity-drafts';
import {initializeFour,fourTask,locateChecks,checkFour,saveHumanReview,reviewInput} from '@/lib/research/collaboration';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db,get,save} from '@/lib/research/store';
import {loadStageInput,saveStageInput,stageRecovery,type StageInput} from '@/lib/research/harness/recovery';
import {runResearchHarness,HARNESS_RUNTIME} from '@/lib/research/harness/runner';
import {executeAgentTurn} from '@/lib/research/model-turn';
import {log,type Project} from '@/lib/research/domain';
import {scanReflections} from '@/lib/research/governance';
import {QwenModel} from '@/lib/research/qwen-model';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {QWEN_TIMEOUT_MS} from '@/lib/research/provider-config';
import {collectV2exFeed} from '@/lib/research/v2ex-feed';
import {collectPublic,SOURCE_REQUEST_CAP,type Collection} from '@/lib/research/collection';
import {executeModel,completeTask,failTask,localStep,reserve,errorLabels,type Analysis} from '@/lib/research/execution';
import {restartExistingAnalysis,makeWorkflow,workflowSourceCap,closeCollectionAtLimit,currentWorkflow,controlWorkflow,workflowAdvanceBlockReason,workflowModelCeiling,plannerTask,planningQueries,analysisTask,stopWithoutEvidence,workflowReport,workflowStages,mergeCollected,skipFetchedQueries,normalizeQuery,type WorkflowRecord} from '@/lib/research/workflow';
import {acceptAgentFinal,AgentStepFailure,AGENT_RUNTIME,runSingleRoleAgent,type AgentSpend} from '@/lib/research/agent-loop';
import type {ModelTask,ModelResult} from '@/lib/research/model-port';
const input=z.object({version:z.number().int().positive(),callId:z.string().uuid(),action:z.enum(['start','restart','analyze-existing','advance','recover-stage','pause','resume','cancel','retry','recover','review']),mode:z.enum(['single','four']).default('single'),review:reviewInput.optional(),freeTierOnlyConfirmed:z.boolean().default(false),allowSupplement:z.boolean().default(true),sourceProfile:z.enum(['public','v2ex']).default('public'),sourceNode:z.enum(['programmer','create','qna']).default('programmer')}).strict();
const response=(p:Project)=>NextResponse.json({project:p});
const modelStages=new Set(['plan','analyze','gap','reanalyze','needs','commercial','verifier','synthesis']);
const sourceStages=new Set(['collect','supplement']);
const safeError=(code:string)=>code in errorLabels||code==='NO_USABLE_EVIDENCE'?code:'MODEL_REPORTED_ERROR';
function addAction(p:Project,id:string){p.actions=[...p.actions.slice(-49),id];}
function afterAnalyze(p:Project){const w=p.workflow!;if(w.allowSupplement&&w.stage==='analyze'&&w.budget.modelAttempts+2<=w.budget.modelLimit&&w.budget.sourceAttempts+SOURCE_REQUEST_CAP<=w.budget.sourceLimit&&w.budget.searches<w.budget.searchLimit&&p.budget.searches<6)w.stage='gap';else{if(w.allowSupplement&&w.stage==='analyze')w.limitations.push('剩余预算不足以同时补搜和重新分析，本轮保留证据缺口。');w.stage='check';}}
export const maxDuration=300;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
  if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
  const b=input.parse(await request.json()),{id}=await context.params,p=await get(id);if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
  if(p.actions.includes(b.callId)||p.workflow?.records.some(r=>r.id===b.callId))return response(p);
  if(p.version!==b.version)throw new Error('VERSION_CONFLICT');
  const requestId=b.callId,resuming=b.action==='recover-stage';let restored:StageInput|undefined;
  if(resuming){const permission=await stageRecovery(db(),p);if(!permission.allowed)throw Error(permission.reason);restored=await loadStageInput(db(),permission.threadId);if(restored.retrievalMode&&restored.retrievalMode!==(env.SEMANTIC_RETRIEVAL_ENABLED==='true'?'semantic':'lexical'))throw Error('检索配置已变化，不能复用旧线程。');b.callId=restored.task.call_id;}
  if(b.action==='analyze-existing'){
    qwenCredentials(b.freeTierOnlyConfirmed);
    const next=restartExistingAnalysis(p),previous=p.workflow!;
    p.workflowHistory=[previous,...(p.workflowHistory||[])].slice(0,2);p.workflow=next;
    addAction(p,b.callId);log(p,'保留原轮记录，使用当前原文重新分析；新轮最多 2 次模型请求，未重新采集或重置累计用量');
    return response(await save(p,b.version));
  }
  if(b.action==='start'||b.action==='restart'){
    qwenCredentials(b.freeTierOnlyConfirmed);
    if(b.action==='restart'){
      if(b.mode!=='four'||p.workflow?.mode!=='four'||p.workflow.status!=='failed')throw new Error('只有已停止的四角色流程可以保留记录并重新开始。');
      // Cancel and create in one versioned save. An initialization failure or
      // concurrent edit cannot leave the persisted old round half-cancelled.
      controlWorkflow(p,'cancel');
    }
    const w=makeWorkflow(p,b.allowSupplement,b.mode,b.sourceProfile,b.sourceNode);if(b.mode==='four')await initializeFour(p,w);
    if(p.workflow)p.workflowHistory=[p.workflow,...(p.workflowHistory||[])].slice(0,2);
    p.workflow=w;log(p,`${b.action==='restart'?'保留失败记录并重新创建四角色复核':'创建一键研究'}；最多 ${w.budget.modelLimit} 次模型请求；尚未调用模型`);addAction(p,b.callId);return response(await save(p,b.version));
  }
  if(b.action==='review'){const w=currentWorkflow(p);if(!b.review)throw new Error('请填写人工评审。');saveHumanReview(w,b.review);w.report=workflowReport(p,w);addAction(p,b.callId);log(p,'保存单／多角色人工对照评审；未调用模型');return response(await save(p,b.version));}
  if(b.action!=='advance'&&b.action!=='recover-stage'){controlWorkflow(p,b.action);scanReflections(p);log(p,'一键研究：'+{pause:'暂停',resume:'恢复',cancel:'取消',retry:'准备重试',recover:'恢复过期检查点'}[b.action]);addAction(p,b.callId);return response(await save(p,b.version));}
  if(['paused','cancelled','completed'].includes(p.status)||p.archived)throw new Error('请先恢复项目研究。');
  const w=currentWorkflow(p);if(!resuming&&(w.status!=='ready'||w.lease))throw new Error('流程未就绪，或有步骤正在执行。');
  if(!resuming&&closeCollectionAtLimit(p,w,b.callId)){
    addAction(p,b.callId);log(p,'采集预算收尾：已有资料保留，未执行检索明确记录；未调用模型或来源');
    return response(await save(p,b.version));
  }
  const blocked=resuming?'':workflowAdvanceBlockReason(p,w);if(blocked)throw new Error(blocked);
  const sourceCap=workflowSourceCap(w);
  const stage=w.stage,isModel=modelStages.has(stage),isSource=sourceStages.has(stage);let task:ModelTask|undefined,key:string|undefined;
  if(resuming){task=restored!.task;key=qwenCredentials(b.freeTierOnlyConfirmed);}
  if(isModel&&!resuming){
    if(w.budget.modelAttempts>=w.budget.modelLimit)throw new Error('已达到本轮模型调用上限。');
    key=qwenCredentials(b.freeTierOnlyConfirmed);
    task=w.mode==='four'?fourTask(p,w,b.callId):stage==='plan'||stage==='gap'?plannerTask(p,w,b.callId):analysisTask(p,w,b.callId);
    w.budget.modelAttempts++;p.budget.modelCalls++;
    if(w.analysisRun&&['analyze','reanalyze','needs','commercial','verifier','synthesis'].includes(stage))w.analysisRun.budget.requests=(w.analysisRun.budget.requests||0)+1;
  }
  if(isSource){
    if(w.budget.searches>=w.budget.searchLimit||p.budget.searches>=6||w.budget.sourceAttempts+sourceCap>w.budget.sourceLimit||!w.queries[w.collectIndex])throw new Error('已达到本轮采集上限。');
    w.budget.searches++;p.budget.searches++;w.budget.sourceAttempts+=sourceCap;p.budget.requests+=sourceCap;
  }
  if(!isModel&&!isSource){const r=w.analysisRun;if(!r)throw new Error('MISSING_PROPOSAL');reserve({...p,run:r},b.callId);}
  const record:WorkflowRecord=resuming?w.records.find(r=>r.id===b.callId)!:{id:b.callId,stage,kind:isModel?'model':isSource?'source':'local',state:'running',started:new Date().toISOString(),elapsedMs:0,error:'',...(task?{input:structuredClone(task),...(w.harnessVersion?{harnessThreadId:`${task.project_id}:${task.run_id}:${task.call_id}`}:{})}:{})};
  const priorCollection=resuming&&record.collection?structuredClone(record.collection):undefined;
  if(resuming){(record.recoveries||=[]).push({id:requestId,at:new Date().toISOString(),error:record.error});record.state='running';record.error='';}
  else w.records.push(record);w.status='running';w.error='';w.lease={callId:b.callId,expires:new Date(Date.now()+(w.harnessVersion?180000:75000)).toISOString()};addAction(p,requestId);
  const reserved=await save(p,b.version),started=Date.now();let output:(ModelResult&{data:Analysis})|undefined,collection:Collection|undefined,error='',outputIssues:string[]=[],planned:string[]|undefined,agentSpend:AgentSpend|undefined;const adapter=key?new QwenModel(key):undefined;
  const emptySpend=():AgentSpend=>({extraModelCalls:0,sourceAttempts:0,searches:0,trace:[],collections:[],retrieval:[],fetchedQueries:[]});
  let expectedVersion=reserved.version,reservedExtraModels=record.harnessReservations?.models||0,reservedToolRequests=record.harnessReservations?.sources||0,reservedToolSearches=record.harnessReservations?.searches||0;
  const modelReceipts:{usage?:ModelResult['usage'];requestId?:string}[]=[];
  const embedding=env.SEMANTIC_RETRIEVAL_ENABLED==='true'?new QwenEmbedding(key||'',env.EMBEDDING_FREE_TIER_ONLY_CONFIRMED==='true'):undefined;
  const frozenRevision=p.revision,frozenEvidenceVersion=p.evidenceVersion;
  async function ensureLease(){
    const live=await get(id);
    if(!live||live.version!==expectedVersion||live.revision!==frozenRevision||live.evidenceVersion!==frozenEvidenceVersion||live.workflow?.id!==w.id||live.workflow.status!=='running'||live.workflow.lease?.callId!==b.callId||Date.parse(live.workflow.lease.expires)<=Date.now())throw new Error('EXECUTION_INTERRUPTED');
  }
  async function reserveExtra(kind:'model'|'source'|'embedding',amount=1){
    const live=await get(id);
    if(!live||live.version!==expectedVersion||live.workflow?.id!==w.id||live.workflow.lease?.callId!==b.callId||live.workflow.status!=='running'||Date.parse(live.workflow.lease.expires)<=Date.now())throw new Error('EXECUTION_INTERRUPTED');
    const bw=live.workflow.budget;
    if(kind==='model'){if(bw.modelAttempts>=bw.modelLimit)throw new Error('MODEL_BUDGET');if(bw.modelAttempts>=workflowModelCeiling(live.workflow))throw new Error('MODEL_STAGE_BUDGET');bw.modelAttempts++;live.budget.modelCalls++;reservedExtraModels++;if(live.workflow.analysisRun)live.workflow.analysisRun.budget.requests=(live.workflow.analysisRun.budget.requests||0)+1;}
    if(kind==='source'){if(bw.sourceAttempts+amount>bw.sourceLimit||bw.searches>=bw.searchLimit||live.budget.searches>=6)throw new Error('SOURCE_BUDGET');bw.sourceAttempts+=amount;bw.searches++;live.budget.requests+=amount;live.budget.searches++;reservedToolRequests+=amount;reservedToolSearches++;}
    if(kind==='embedding'){if((bw.embeddingAttempts||0)>=2)throw new Error('EMBEDDING_BUDGET');bw.embeddingAttempts=(bw.embeddingAttempts||0)+1;}
    live.workflow.records.find(r=>r.id===b.callId)!.harnessReservations={models:reservedExtraModels,sources:reservedToolRequests,searches:reservedToolSearches};
    live.workflow.lease.expires=new Date(Date.now()+(w.harnessVersion?180000:75000)).toISOString();
    const saved=await save(live,expectedVersion);expectedVersion=saved.version;
  }
  async function frozen(input:StageInput){if(!w.harnessVersion)return input;const value=restored||{...input,retrievalMode:embedding?'semantic' as const:'lexical' as const};await saveStageInput(db(),record.harnessThreadId!,value);return value;}
  try{
    if(adapter&&task){
      if(w.mode==='four'){
        let raw:ModelResult;
        if(w.harnessVersion){
          const agent=await runResearchHarness({database:db(),threadId:record.harnessThreadId,resume:resuming,...await frozen({task,evidence:p.evidence,since:w.since,allowFollowUp:false,finalizeAtLimit:true,budget:{modelLimit:w.budget.modelLimit,modelAttempts:w.budget.modelAttempts,sourceLimit:w.budget.sourceLimit,sourceAttempts:w.budget.sourceAttempts,searchLimit:w.budget.searchLimit,searches:w.budget.searches,paidBudget:0}}),guard:ensureLease,invoke:next=>executeAgentTurn(next,adapter,QWEN_TIMEOUT_MS)});
          if(!agent.final)throw new Error('INVALID_MODEL_OUTPUT');raw=agent.final;if(agent.receipts.length)modelReceipts.push(...agent.receipts);
        }else raw=await executeModel(task,adapter,QWEN_TIMEOUT_MS);
        output=acceptAgentFinal(raw,task,issues=>{outputIssues=issues});locateChecks(output,task,issue=>{outputIssues.push(issue)});
      }
      else{
        const agent=await (w.harnessVersion?runResearchHarness:runSingleRoleAgent)({database:db(),threadId:record.harnessThreadId,resume:resuming,guard:ensureLease,...await frozen({task,evidence:p.evidence,since:w.since,allowFollowUp:w.budget.modelAttempts<workflowModelCeiling(w),finalizeAtLimit:true,budget:{modelLimit:workflowModelCeiling(w),modelAttempts:w.budget.modelAttempts,sourceLimit:w.budget.sourceLimit,sourceAttempts:w.budget.sourceAttempts,searchLimit:w.budget.searchLimit,searches:w.budget.searches,paidBudget:0}}),beforeModel:()=>reserveExtra('model'),beforeTool:(_name,count)=>reserveExtra('source',count),...(embedding?{retrieve:async(evidence:typeof p.evidence,query:string)=>{if(env.EMBEDDING_FREE_TIER_ONLY_CONFIRMED!=='true')throw new Error('EMBEDDING_NOT_CONFIGURED');await reserveExtra('embedding');return retrieveSemanticEvidence(evidence,query,embedding);}}:{}),invoke:async next=>{try{return await executeAgentTurn(next,adapter,QWEN_TIMEOUT_MS);}finally{modelReceipts.push({requestId:adapter.receipt.requestId,usage:adapter.receipt.usage?{...adapter.receipt.usage}:undefined});}}});
        agentSpend=agent.spend;if('receipts' in agent&&Array.isArray(agent.receipts)){modelReceipts.splice(0,modelReceipts.length,...agent.receipts);}
        if(!agent.final)throw new Error(agent.spend.trace.some(t=>t.reason==='MODEL_BUDGET')?(workflowModelCeiling(w)<w.budget.modelLimit?'MODEL_STAGE_BUDGET':'MODEL_BUDGET'):'INVALID_MODEL_OUTPUT');
        task=agent.finalTask;output=acceptAgentFinal(agent.final,task,issues=>{outputIssues=issues});
        if(stage==='plan'||stage==='gap')planned=planningQueries(output,w,issues=>{outputIssues=issues});
      }
    }
    else if(isSource)collection=w.sourceProfile==='v2ex'?await collectV2exFeed(w.sourceNode||'',w.since,sourceCap):await collectPublic(w.queries[w.collectIndex].query,w.since);
    else{const r=w.analysisRun!,t=r.tasks.find(t=>t.id===stage)!;if(w.mode==='four'&&stage==='check')checkFour(w);localStep(p,r,t);}
  }catch(e){if(e instanceof AgentStepFailure)agentSpend=e.spend;error=safeError((e as Error).message);}
  const current=await get(id);if(!current)return NextResponse.json({error:'项目已删除，结果未写入。'},{status:409});
  if(current.version!==expectedVersion||current.workflow?.id!==w.id||current.workflow?.lease?.callId!==b.callId||current.workflow.status!=='running'||Date.parse(current.workflow.lease.expires)<=Date.now()){
    // User edits/pause/cancel win. Never replace their newer state with late output.
    if(current.workflow?.id===w.id&&current.workflow.lease?.callId===b.callId){const cw=current.workflow,cr=cw.records.find(r=>r.id===b.callId)!;cr.state='failed';cr.error='EXECUTION_INTERRUPTED';cw.status='failed';cw.error=cr.error;cw.needsRetry=true;cw.lease=undefined;try{await save(current,current.version)}catch{}}
    return NextResponse.json({error:'研究状态已改变，迟到结果未写入；请刷新检查点。'},{status:409});
  }
  const cw=current.workflow!,cr=cw.records.find(r=>r.id===b.callId)!;cr.elapsedMs=(resuming?cr.elapsedMs:0)+Date.now()-started;
  if(adapter){cr.usage=adapter.receipt.usage;cr.requestId=adapter.receipt.requestId;cr.normalizations=adapter.receipt.normalizations;cr.outputIssues=outputIssues.length?outputIssues:adapter.receipt.outputIssues;}
  if(w.mode==='four'&&modelReceipts.length){cr.agentModelReceipts=modelReceipts;const known=modelReceipts.filter(r=>r.usage);if(known.length)cr.usage=known.reduce((a,r)=>({input_tokens:a.input_tokens+r.usage!.input_tokens,output_tokens:a.output_tokens+r.usage!.output_tokens}),{input_tokens:0,output_tokens:0});cr.requestId=modelReceipts.at(-1)?.requestId||cr.requestId;}
  if(w.mode!=='four'&&isModel){
    cr.agentModelReceipts=modelReceipts;if(modelReceipts.at(-1)?.requestId)cr.requestId=modelReceipts.at(-1)!.requestId;
    const known=modelReceipts.filter(r=>r.usage);
    cr.usage=known.length?known.reduce((sum,r)=>({input_tokens:sum.input_tokens+r.usage!.input_tokens,output_tokens:sum.output_tokens+r.usage!.output_tokens}),{input_tokens:0,output_tokens:0}):undefined;
    if(embedding?.receipt.requests)cr.embeddingReceipt={...embedding.receipt};
    if(task)cr.input=structuredClone(task);
    const spend=agentSpend||emptySpend();
    cr.agentRuntime=cw.harnessVersion?HARNESS_RUNTIME:AGENT_RUNTIME;
    if(spend.trace.length)cr.agentTools=spend.trace;
    cw.budget.modelAttempts+=Math.max(0,spend.extraModelCalls-reservedExtraModels);current.budget.modelCalls+=Math.max(0,spend.extraModelCalls-reservedExtraModels);
    cw.budget.sourceAttempts+=(resuming?Math.max(0,spend.sourceAttempts-reservedToolRequests):spend.sourceAttempts-reservedToolRequests);current.budget.requests+=(resuming?Math.max(0,spend.sourceAttempts-reservedToolRequests):spend.sourceAttempts-reservedToolRequests);
    cw.budget.searches+=(resuming?Math.max(0,spend.searches-reservedToolSearches):spend.searches-reservedToolSearches);current.budget.searches+=(resuming?Math.max(0,spend.searches-reservedToolSearches):spend.searches-reservedToolSearches);
    // Source collection has its own validation boundary. Preserve eligible
    // originals even if the later model result fails; never preserve rejected analysis.
    {
      if(spend.collections.length){
        const ids:string[]=[],usableIds:string[]=[];let added=0,duplicate=0,titleOnly=0,requests=0,failed=0,skipped=0;
        for(const item of spend.collections){const merged=mergeCollected(current,cw,item);ids.push(...merged.newIds);usableIds.push(...item.usableIds);added+=merged.added;duplicate+=merged.duplicate;titleOnly+=merged.titleOnly;requests+=item.requests;failed+=item.failed;skipped+=item.skipped;}
        if(ids.length)cw.freshIds=ids;
        cr.collection={query:spend.fetchedQueries.join('；')||'agent',requests,failed,skipped,limited:spend.collections.some(item=>item.limited),since:cw.since,added:added+(priorCollection?.added||0),duplicate:Math.max(0,duplicate-(priorCollection?.added||0)),titleOnly,usableIds,sourceDetails:spend.collections.flatMap(item=>item.sourceDetails||[]),sourceErrors:spend.collections.flatMap(item=>item.sourceErrors||[])};
        cw.agentFetchedQueries=[...new Set([...(cw.agentFetchedQueries||[]),...(spend.fullSourceQueries||[])])];
      }
      if(spend.retrieval.length)cw.retrieval=spend.retrieval.filter(hit=>current.evidence.some(item=>item.id===hit.id&&!item.excluded));
    }
  }
  // Only trusted tool originals from this unchanged lease advance the input
  // version of a successful single-role analysis. Older/historical runs stay untouched.
  if(!error&&cw.analysisRun&&['analyze','reanalyze'].includes(stage))cw.analysisRun.evidenceVersion=cw.evidenceVersion;
  cw.lease=undefined;
  if(error){
    cr.state='failed';cr.error=error;cw.status='failed';cw.error=error;cw.needsRetry=true;
    if(cw.analysisRun&&['analyze','reanalyze','needs','commercial','verifier','synthesis','check','deliver'].includes(stage)){const r=cw.analysisRun,t=r.tasks.find(t=>cw.mode==='four'||['check','deliver'].includes(stage)?t.id===stage:t.role==='coordinator')!;failTask(r,t,error,requestId,cr.elapsedMs);const call=t.calls.at(-1)!;call.usage=cr.usage;call.requestId=cr.requestId;call.outputIssues=cr.outputIssues;call.normalizations=cr.normalizations;}
    log(current,'一键研究停止：'+(errorLabels[error]||error));scanReflections(current);return response(await save(current,current.version));
  }
  if(cw.harnessVersion&&isModel)cr.agentRuntime=HARNESS_RUNTIME;
  cr.state='done';cw.status='ready';cw.error='';cw.needsRetry=false;
  if(output){
    cr.output=output;
    if(stage==='plan'){
      cw.queries=planned!.map(query=>({query,purpose:'initial',reason:'根据已确认的研究方向规划'}));cw.framing=output.data.framing;cw.limitations.push(...output.gaps.slice(0,4));skipFetchedQueries(cw);
      if(cw.collectIndex<cw.queries.length)cw.stage='collect';else if(cw.usableIds.length||current.evidence.some(e=>e.kind==='imported'&&!e.excluded))cw.stage='analyze';else stopWithoutEvidence(current,cw);
    }else if(stage==='gap'){
      const queries=planned!;
      if(queries.length){
        cw.queries.push({query:queries[0],purpose:'supplement',reason:output.gaps.join('；').slice(0,1000)});cw.initialAnalysis=cw.analysisRun;
        if((cw.agentFetchedQueries||[]).some(query=>normalizeQuery(query)===normalizeQuery(queries[0]))){cw.collectIndex=cw.queries.length;if(cw.freshIds.length)cw.stage='reanalyze';else{cw.limitations.push('补搜未取得可分析的新正文，保留原判断和证据缺口，未追加模型分析。');cw.stage='check';}}
        else cw.stage='supplement';
      }
      else{cw.limitations.push(...output.gaps.slice(0,4));cw.stage='check';}
    }else{
      const r=cw.analysisRun!,t=r.tasks.find(t=>cw.mode==='four'?t.id===stage:t.role==='coordinator')!;if(cw.mode==='four')cr.supportChecks=locateChecks(output,task!);t.output=output;if(task)t.inputSnapshot=structuredClone(task);completeTask(r,t,requestId,cr.elapsedMs);const call=t.calls.at(-1)!;call.usage=cr.usage;call.requestId=cr.requestId;call.outputIssues=cr.outputIssues;call.normalizations=cr.normalizations;if(cw.mode==='four')cw.stage=r.tasks.find(t=>t.status==='pending'&&t.deps.every(id=>r.tasks.find(x=>x.id===id)?.status==='done'))!.id as typeof cw.stage;else afterAnalyze(current);
    }
  }
  if(collection){
    const merged=mergeCollected(current,cw,collection);cw.freshIds=merged.newIds;
    cw.budget.sourceAttempts-=sourceCap-collection.requests;current.budget.requests-=sourceCap-collection.requests;
    const {evidence:_,...meta}=collection;cr.collection={...meta,added:merged.added,duplicate:merged.duplicate,titleOnly:merged.titleOnly};
    if(collection.failed)cw.limitations.push(`检索「${collection.query}」有 ${collection.failed} 次来源请求失败，已有正文保留。`);
    cw.collectIndex++;
    if(stage==='supplement'){
      if(merged.newIds.length)cw.stage='reanalyze';else{cw.limitations.push('补搜未取得可分析的新正文，保留原判断和证据缺口，未追加模型分析。');cw.stage='check';}
    }else if(cw.collectIndex<cw.queries.length)cw.stage='collect';else if(cw.usableIds.length||current.evidence.some(e=>e.kind==='imported'&&!e.excluded))cw.stage='analyze';else stopWithoutEvidence(current,cw);
    scanReflections(current);
  }
  if(!isModel&&!isSource){
    const r=cw.analysisRun!,t=r.tasks.find(t=>t.id===stage)!;if(stage==='deliver')r.report=w.analysisRun!.report;completeTask(r,t,requestId,cr.elapsedMs);
    if(stage==='check')cw.stage='deliver';else{
      if(current.run)current.runHistory=[current.run,...(current.runHistory||[])].slice(0,3);
      saveOpportunityDraft(current,r);current.run=r;cw.status='completed';cw.report=workflowReport(current,cw);current.status='awaiting_decision';
    }
  }
  closeCollectionAtLimit(current,cw,b.callId+':collection-closeout');
  log(current,`一键研究：${workflowStages[stage]}完成${cw.status==='completed'?'；草稿已保存，等待人工判断':''}`);
  return response(await save(current,current.version));
}catch(e){const msg=e instanceof Error?e.message:'';return NextResponse.json({error:msg==='VERSION_CONFLICT'?'项目已变更，请刷新检查点。':e instanceof z.ZodError?'一键研究参数不正确。':msg||'执行失败。'},{status:msg==='VERSION_CONFLICT'?409:400})}}
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const p=await get((await context.params).id);return p?response(p):NextResponse.json({error:'项目不存在'},{status:404})}catch{return NextResponse.json({error:'读取研究检查点失败。'},{status:503})}}
