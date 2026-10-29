import {isResearchEvidence,isAnalysisBody} from './evidence-eligibility';
import {rankResearchEvidence} from './research-relevance';
import {readerWorkflowReport} from './reader-report';
import {workflowModelUsage} from './workflow-usage';
import {evidenceQualityReport} from './evidence-quality';
import {QWEN_MODEL} from './provider-config';
import {EXPANDED_SOURCE_NAMES,EXPANDED_SOURCE_SCOPE} from './source-catalog';
import {collectionStartBlocker} from './workflow-start';
import type {Project,Evidence} from './domain';
import type {ModelTask,ModelResult} from './model-port';
import {buildTask,makeRun,reserve,failTask,invalidateRun,type Run,type Analysis,type ConclusionReview} from './execution';
import {collaborationReport,type FrozenInput,type Comparison,type LocatedCheck} from './collaboration';
import {sourceCoverage} from './source-coverage';
import type {Collection} from './collection';
import {V2EX_NODES,isV2exNode,type SourceProfile,type V2exNode} from './domestic-sources';
import {formatProjectRetrieval,type RetrievalHit} from './agent-loop';
import {stageCeiling,stageAttempts,modelRetryBlock} from './stage-budget';
export const WORKFLOW_VERSION='opportunity-workflow/7';
export const workflowStages={plan:'规划检索',collect:'采集公开资料',analyze:'归纳机会与反证',gap:'判断证据缺口',supplement:'补充检索',reanalyze:'复核机会判断',check:'校验引用与结构',deliver:'保存研究草稿',needs:'需求分析',commercial:'替代与商业分析',verifier:'独立反证核查',synthesis:'协调汇总与核查'};
export function stagesFor(w?:ResearchWorkflow){const keys:WorkflowStage[]=w?.mode==='four'?['needs','commercial','verifier','synthesis','check','deliver']:w?.useExistingEvidence?['analyze','check','deliver']:w?.sourceProfile==='v2ex'?['collect','analyze','check','deliver']:['plan','collect','analyze','gap','supplement','reanalyze','check','deliver'];return Object.fromEntries(keys.map(k=>[k,workflowStages[k]]));}
export type WorkflowStage=keyof typeof workflowStages;
export type WorkflowRecord={preparation?:true;harnessThreadId?:string;harnessReservations?:{models:number;sources:number;searches:number};recoveries?:{id:string;at:string;error:string}[];id:string;stage:WorkflowStage;kind:'model'|'source'|'local';state:'running'|'done'|'failed';started:string;elapsedMs:number;error:string;collectionCloseout?:{reason:'search_limit'|'project_search_limit'|'source_limit';unexecutedQueries:string[];next:'analyze'|'reanalyze'|'check'|'partial'};supportChecks?:LocatedCheck[];outputIssues?:string[];normalizations?:string[];usage?:ModelResult['usage'];requestId?:string;input?:ModelTask;output?:ModelResult;agentModelReceipts?:{usage?:ModelResult['usage'];requestId?:string}[];embeddingReceipt?:{requests:number;input_tokens?:number;model:string};agentRuntime?:string;agentTools?:{name:string;status:'executed'|'refused';reason:string;requests:number}[];collection?:Omit<Collection,'evidence'> & {added:number;duplicate:number;titleOnly:number}};
export type ResearchWorkflow={harnessVersion?:string;useExistingEvidence?:true;sourceProfile?:SourceProfile;sourceNode?:V2exNode;conclusionAudit?:import('./conclusion-audit').ConclusionAudit;mode?:'single'|'four';frozen?:FrozenInput;comparison?:Comparison;conclusionReview?:ConclusionReview;id:string;version:string;revision:number;evidenceVersion:number;created:string;status:'ready'|'running'|'paused'|'failed'|'completed'|'partial'|'cancelled'|'stale';stage:WorkflowStage;allowSupplement:boolean;queries:{query:string;purpose:'initial'|'supplement';reason:string}[];collectIndex:number;usableIds:string[];freshIds:string[];limitations:string[];records:WorkflowRecord[];budget:{embeddingAttempts?:number;modelLimit:1|2|4|8;modelAttempts:number;stageLimit?:2;stageAttempts?:Record<string,number>;sourceLimit:30;sourceAttempts:number;searchLimit:3;searches:number};lease?:{callId:string;expires:string};analysisRun?:Run;initialAnalysis?:Run;error:string;needsRetry:boolean;report:string;since:number|null;framing?:Analysis['framing'];retrieval?:RetrievalHit[];agentFetchedQueries?:string[]};
export function activeWorkflow(p:Project){return !!p.workflow&&['ready','running','paused','failed'].includes(p.workflow.status);}
export function failureDiagnostics(w:Pick<ResearchWorkflow,'stage'|'evidenceVersion'|'revision'|'records'|'analysisRun'>){
  const failed=[...w.records].reverse().find(r=>r.state==='failed');
  return {stage:w.stage,protocol:w.analysisRun?.reviewProtocol||'',evidenceVersion:w.evidenceVersion,revision:w.revision,inputTokens:failed?.usage?.input_tokens??null,outputTokens:failed?.usage?.output_tokens??null,requestId:failed?.requestId||'',fields:failed?.outputIssues||[]};
}
export function sinceForPeriod(period:string,now=Date.now()){
  const normalized=period.trim();if(/不限|全部|所有时间/.test(normalized))return null;
  const match=normalized.match(/近\s*(\d+|一|三|六|半)\s*(年|个月|月|天)/);
  if(!match)return null;
  const values:Record<string,number>={一:1,三:3,六:6,半:0.5};const n=Number(match[1])||values[match[1]];if(!Number.isFinite(n)||n<=0)return null;
  const days=n*(match[2]==='年'?365:match[2]==='天'?1:30);
  return Math.floor((now-Math.min(days,3650)*86400000)/1000);
}
export function makeWorkflow(p:Project,allowSupplement:boolean,mode:'single'|'four'='single',sourceProfile:SourceProfile='public',sourceNode:V2exNode='programmer',useExistingEvidence=false):ResearchWorkflow{
  if(!p.confirmed||['paused','cancelled','completed'].includes(p.status)||p.archived)throw new Error('请先确认并恢复研究范围。');
  if(p.mode==='replay'||p.evidence.some(e=>e.kind==='synthetic'))throw new Error('一键研究需要无虚构资料的真实研究项目，请新建项目。');
  if(p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status))throw new Error('请先完成或结束结论复核，再开始新执行。');
  if(activeWorkflow(p)||p.run&&['ready','running','paused','failed'].includes(p.run.status))throw new Error('请先完成或取消当前执行。');
  if(sourceProfile==='v2ex'&&(mode!=='single'||!isV2exNode(sourceNode)))throw new Error('V2EX 节点采样仅用于单角色采集；四角色请使用已有资料。');
  if(sourceProfile==='v2ex'&&allowSupplement)throw new Error('V2EX 节点采样不支持关键词补搜，请关闭补搜后开始。');
  if(useExistingEvidence&&(mode!=='single'||!existingAnalysisSources(p).length))throw new Error('请先补充至少一条当前可用的真实正文。');
  if(mode==='single'&&!useExistingEvidence){const blocked=collectionStartBlocker(p,sourceProfile);if(blocked)throw new Error(blocked.message);}
  const since=sinceForPeriod(p.period);
  return {...(useExistingEvidence?{useExistingEvidence:true as const}:{}),...(sourceProfile==='v2ex'?{sourceProfile,sourceNode}:{}),mode,harnessVersion:'research-harness/1',id:crypto.randomUUID(),version:WORKFLOW_VERSION,revision:p.revision,evidenceVersion:p.evidenceVersion||0,created:new Date().toISOString(),status:'ready',stage:useExistingEvidence?'analyze':mode==='four'?'needs':sourceProfile==='v2ex'?'collect':'plan',allowSupplement:mode==='single'&&allowSupplement,queries:sourceProfile==='v2ex'?[{query:sourceNode,purpose:'initial',reason:'操作者选择的公开节点订阅，非关键词搜索'}]:[],collectIndex:0,usableIds:useExistingEvidence?existingAnalysisSources(p).map(e=>e.id):[],freshIds:[],limitations:useExistingEvidence?['本轮只分析当前已保存原文，不重新规划、采集或调用工具；来源及人群覆盖仍需核查。','正常分析使用 1 次模型请求；新轮最多 2 次，仅在失败后由用户显式准备重试；不自动重试、不改变旧轮用量。']:sourceProfile==='v2ex'?['公开来源为 V2EX 中文技术社区的节点订阅，不代表全体国内用户或目标客户。',`本轮仅采样「${V2EX_NODES[sourceNode]}」订阅，最多 6 篇有正文的主题；不按关键词搜全站，不读评论、不翻页、不访问外链。`,'未采样的历史讨论、反例和付费事实仍未知。先核查主题与研究范围是否相关；无相关线索不等于没有需求。','单角色只分析采样及已有导入原文，最多 2 次模型请求，不追加工具或补搜，不自动重试。']:mode==='four'?['本轮只复核冻结的已有资料；来源、人群、地域与时间覆盖需结合原始采集记录核查。']:['公开来源包括中国新闻网、国家统计局、少数派、博客园、OSCHINA、GitHub Issues、Hacker News 与中文维基百科；新闻、技术社区与资讯不能代表目标地域或全部国内用户。','每个检索词最多 10 次来源请求，多渠道共享上限。按关键词语言分配来源，中文优先国家统计局，英文保留 Hacker News 帖子和评论；未安排的渠道单独标记。中国新闻网按关键词搜索公开报道；中文订阅只筛选近期条目。在剩余请求内取得中国新闻网、少数派或博客园正文，未取得全文时标记摘要，不访问任意外链。','单角色模型步骤由受限研究执行器运行工具循环。模型可请求多渠道公开检索、Hacker News 阅读、中文维基百科摘录及本项目资料检索；沿用原有次数上限，不自动追加请求。',...(since===null&&!/不限|全部|所有时间/.test(p.period)?['无法把当前时间描述转换为日期过滤，原始日期已保留，时间匹配需人工核查。']:[])],records:[],budget:{modelLimit:useExistingEvidence||sourceProfile==='v2ex'?2:mode==='four'||allowSupplement?8:4,modelAttempts:0,stageLimit:2,stageAttempts:{},sourceLimit:30,sourceAttempts:0,searchLimit:3,searches:0},error:'',needsRetry:false,report:'',since};
}
export function existingAnalysisSources(p:Project){return p.evidence.filter(e=>isResearchEvidence(e,p.title+' '+p.audience));}
export function existingAnalysisBlockReason(p:Project){
 if(p.workflow&&(p.workflow.mode==='four'||!['failed','completed','partial','stale'].includes(p.workflow.status)||p.workflow.lease))return '仅支持从已停止或已保存草稿、且没有执行中请求的单角色研究重新分析。';
 if(!p.confirmed||p.archived||p.mode!=='manual'||['paused','cancelled','completed'].includes(p.status))return '请先确认并恢复当前真实研究范围。';
 if(p.evidence.some(e=>e.kind==='synthetic')||!existingAnalysisSources(p).length)return '至少需要一条当前可用的真实正文；只有标题或被排除的资料不能用于分析。';
 if(p.run&&['ready','running','paused','failed'].includes(p.run.status))return '请先结束执行与评测中的任务。';
 if(p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status))return '请先完成或结束结论复核。';
 return '';
}
export function restartExistingAnalysis(p:Project){
 const blocked=existingAnalysisBlockReason(p);if(blocked)throw new Error(blocked);
 return makeWorkflow({...p,workflow:undefined},false,'single','public','programmer',true);
}
export function currentWorkflow(p:Project){const w=p.workflow;if(!w)throw new Error('尚未创建一键研究。');if(w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0)||w.status==='stale')throw new Error('研究范围或资料已改变，请取消旧流程并重新开始。');return w;}
function brief(p:Project,w:ResearchWorkflow){return {title:p.title,audience:p.audience,region:p.region,period:p.period,exclusions:p.exclusions,decision:p.decision,source_scope:w.useExistingEvidence?'本轮只分析当前已保存的原文，不重新规划或采集。来源、人群、地域及时间覆盖沿用原始记录，不能把已有资料当作新采样或全体目标客户。':w.sourceProfile==='v2ex'?`V2EX 中文技术社区「${V2EX_NODES[w.sourceNode||'programmer']}」节点的公开订阅主题。仅有主题正文，无评论或全站关键词搜索，不代表全体国内用户；与目标研究无关的主题必须保留为无关，不得强行归纳机会。付款仍未经核实。`:`公开来源包括 ${EXPANDED_SOURCE_NAMES}。${EXPANDED_SOURCE_SCOPE} 摘要不能冒充完整原文；百科和资讯不能当作目标客户需求原话。`,source_time_filter:w.useExistingEvidence?'本轮未重新按日期采样，需核对所用原文的资料日期':w.since===null?'未按日期过滤':new Date(w.since*1000).toISOString().slice(0,10)+' 至检索当日'};}
export function plannerTask(p:Project,w:ResearchWorkflow,id:string):ModelTask{
  const previous=w.stage==='gap'?w.analysisRun?.tasks.find(t=>t.role==='coordinator')?.output:undefined;
  const b=brief(p,w);if(w.stage==='gap')b.title+='（根据已有草稿判断是否需要一次可检索补证）';
  const task:ModelTask={project_id:p.id,run_id:w.id,revision:p.revision,call_id:id,role:'needs',purpose:w.stage==='gap'?'gap_plan':'search_plan',brief:{...b,previous_queries:JSON.stringify(w.queries.map(q=>q.query)),known_gaps:JSON.stringify(previous?.gaps||[])},evidence_ids:[],evidence:[],context:{rules:[],memories:[],prior_results:previous?[{task_id:'first_analysis',role:'coordinator',data:previous.data}]:[],simulation:false,attempt:w.budget.modelAttempts+1,scenario:'normal'}};
  if(JSON.stringify(task).length>16000)throw new Error('CONTEXT_LIMIT');return task;
}
export function planningQueries(output:ModelResult&{data:Analysis},w:ResearchWorkflow,diagnose?:(issues:string[])=>void){
  const issues:string[]=[];
  const fail=()=>{if(!issues.length)return;diagnose?.(issues.slice(0,20));throw new Error('INVALID_MODEL_OUTPUT');};
  if(output.evidence_ids.length)issues.push('evidence_ids:not_empty');
  if(output.data.proposal)issues.push('data.proposal:forbidden');
  const limit=w.stage==='gap'?1:2;
  if(output.data.notes.length>limit)issues.push('data.notes:count');
  output.data.notes.forEach((n,i)=>{
    if(n.refs.length)issues.push(`data.notes.${i}.refs:not_empty`);
    if(n.kind!=='gap')issues.push(`data.notes.${i}.kind:not_gap`);
  });
  if(w.stage==='gap'&&output.status==='ok'){
    if(output.data.notes.length===1&&output.data.notes[0].claim!=='STOP')issues.push('data.notes.0.claim:not_stop');
    fail();return [];
  }
  if(w.stage==='gap'){if(output.status!=='partial')issues.push('status:not_partial');}
  else if(output.status!=='ok')issues.push('status:not_ok');
  if(w.stage!=='gap'&&!output.data.framing)issues.push('data.framing:required');
  const normalize=(q:string)=>q.toLowerCase().replace(/\s+/g,' ');
  const queries=output.data.notes.map(n=>n.claim.trim());
  queries.forEach((q,i)=>{
    if(w.stage==='gap'&&q==='STOP')issues.push(`data.notes.${i}.claim:not_keyword`);
    else if(q.length<2||q.length>100)issues.push(`data.notes.${i}.claim:keyword_length`);
    else if(q.split(/\s+/).length>3)issues.push(`data.notes.${i}.claim:keyword_count`);
    else if(!/[A-Za-z\p{Script=Han}]/u.test(q)||/[^\p{Script=Han}\x20-\x7E]|https?:|www\.|@/u.test(q))issues.push(`data.notes.${i}.claim:keyword_charset`);
  });
  if(new Set(queries.map(normalize)).size!==queries.length)issues.push('data.notes:duplicate');
  queries.forEach((q,i)=>{if(w.queries.some(old=>normalize(old.query)===normalize(q)))issues.push(`data.notes.${i}.claim:repeated`);});
  fail();return queries;
}
function balanceSources(items:Evidence[]){
  const groups=new Map<string,Evidence[]>();for(const item of items){const key=item.source||item.kind;const rows=groups.get(key)||[];rows.push(item);groups.set(key,rows);}
  const ordered:Evidence[]=[];let index=0;while(ordered.length<items.length){for(const rows of groups.values())if(rows[index])ordered.push(rows[index]);index++;}return ordered;
}
function analysisEvidence(p:Project,w:ResearchWorkflow){
  const allowed=new Set([...w.usableIds,...p.evidence.filter(e=>e.kind==='imported').map(e=>e.id)]),fresh=new Set(w.freshIds);
  const current=rankResearchEvidence(p.evidence.filter(e=>allowed.has(e.id)&&isResearchEvidence(e,p.title+' '+p.audience)),[p.title,p.audience,p.decision,...w.queries.map(q=>q.query)].join(' '));
  const cited=new Set(w.initialAnalysis?.tasks.find(t=>t.role==='coordinator')?.output?.data.proposal?.refs||[]);
  // Keep cited earlier items, new bodies and different threads before duplicate contexts.
  return [...current.filter(e=>cited.has(e.id)).slice(0,4),...balanceSources(current.filter(e=>fresh.has(e.id)&&!cited.has(e.id))),...balanceSources(current.filter(e=>!fresh.has(e.id)&&!cited.has(e.id)))].filter((e,i,all)=>all.findIndex(x=>x.id===e.id)===i);
}
export function analysisTask(p:Project,w:ResearchWorkflow,id:string){
  const evidence=analysisEvidence(p,w);if(!evidence.length)throw new Error('NO_USABLE_EVIDENCE');
  const temporary:Project={...p,run:undefined,evidence};const r=makeRun(temporary,'single','normal',1);r.adapter='qwen';r.model=QWEN_MODEL;r.paidBudget=0;r.freeTierOnlyConfirmed=true;r.simulation=false;
  temporary.run=r;const reserved=reserve(temporary,id);
  // Add workflow-specific fields before the shared whole-payload budget pass.
  const task=buildTask(temporary,r,reserved.task,id,task=>{
    task.allow_tools=!w.useExistingEvidence&&w.sourceProfile!=='v2ex';task.brief={...task.brief,...brief(p,w)};
    task.context!.rules.push('按问题主题归纳需求，保留不同作者和线程；不要把同一讨论计作多个客户。优先给出一个可验证的机会及其商业假设、已有替代、反证和下一步验证计划。公开自述和点击兴趣不能升级成真实付费承诺。需求卡字段和访谈问题可以省略，省略就保持缺失，不得编造访谈记录或市场结论。');
    const retrieval=formatProjectRetrieval(w.retrieval||[]);if(retrieval)task.context!.rules.push(retrieval);
  });
  w.analysisRun=r;return task;
}
export function stopWithoutEvidence(p:Project,w:ResearchWorkflow){w.status='partial';w.error='NO_USABLE_EVIDENCE';w.lease=undefined;p.status='partial';w.report=`# 一键研究部分完成：${p.title}\n\n未取得足够的可分析原文，未形成产品机会判断。没有搜到资料不代表没有需求。\n\n检索词：${w.queries.map(q=>q.query).join('；')}\n来源请求尝试：${w.budget.sourceAttempts}；模型请求尝试：${w.budget.modelAttempts}\n\n${w.limitations.map(x=>'- '+x).join('\n')}\n\n下一步：调整人群或检索词，或导入有来源的访谈资料后重新研究。\n`;}
export function workflowSourceCap(w:ResearchWorkflow){return w.sourceProfile==='v2ex'?1:10;}
// Closing an exhausted collection is a local transition, never another source request.
export function collectionCloseout(p:Project,w=p.workflow){
 if(!w||w.mode==='four'||w.status!=='ready'||w.lease||!['collect','supplement'].includes(w.stage)||!w.queries[w.collectIndex])return null;
 const reason=w.budget.searches>=w.budget.searchLimit?'search_limit':p.budget.searches>=6?'project_search_limit':w.budget.sourceAttempts+workflowSourceCap(w)>w.budget.sourceLimit?'source_limit':null;
 if(!reason)return null;
 const allowed=new Set(w.usableIds);
 const usable=p.evidence.filter(e=>isResearchEvidence(e,p.title+' '+p.audience)&&(allowed.has(e.id)||e.kind==='imported'));
 let next:'analyze'|'reanalyze'|'check'|'partial';
 if(w.stage==='supplement'){
   const accepted=w.analysisRun?.tasks.find(t=>t.role==='coordinator'&&t.status==='done'&&t.output&&t.inputSnapshot);
   if(!accepted)return null;
   const gap=w.records.filter(r=>r.stage==='gap'&&r.state==='done').at(-1);
   const newInGap=!!gap?.collection?.added&&w.freshIds.some(id=>usable.some(e=>e.id===id));
   next=newInGap?'reanalyze':'check';
 }else next=usable.length?'analyze':'partial';
 const unexecutedQueries=w.queries.slice(w.collectIndex).map(q=>q.query);
 const message=`采集预算已达到上限，剩余 ${unexecutedQueries.length} 个计划检索未执行。`+(next==='analyze'||next==='reanalyze'?'已有正文保留，下一步只分析可用资料；未采集部分保留为证据缺口。':next==='check'?'未取得新的补充正文，保留已有分析并转入引用校验；不追加模型请求。':'尚无可用正文，本轮保留部分成果，不生成机会判断。');
 return {reason:reason as 'search_limit'|'project_search_limit'|'source_limit',unexecutedQueries,next,message};
}
export function closeCollectionAtLimit(p:Project,w:ResearchWorkflow,callId:string){
 const close=collectionCloseout(p,w);if(!close)return false;
 w.records.push({id:callId,stage:w.stage,kind:'local',state:'done',started:new Date().toISOString(),elapsedMs:0,error:'',collectionCloseout:{reason:close.reason,unexecutedQueries:close.unexecutedQueries,next:close.next}});
 w.limitations.push(close.message);w.collectIndex=w.queries.length;
 if(close.next==='partial')stopWithoutEvidence(p,w);else w.stage=close.next;
 return true;
}
// Shared read-only guard: UI and server agree before any reservation.
export function workflowModelCeiling(w:Pick<ResearchWorkflow,'mode'|'stage'|'budget'>){
 if(w.budget.stageLimit===2)return stageCeiling(w.budget,w.stage);
 // A planning tool loop cannot consume the request needed to analyze its sources.
 return w.mode!=='four'&&['plan','gap'].includes(w.stage)?Math.max(0,w.budget.modelLimit-1):w.budget.modelLimit;
}
function stageBudgetBlock(w:ResearchWorkflow){if(w.budget.stageLimit===2)return stageAttempts(w.budget,w.stage)>=2?'当前阶段已用 2 / 2 次请求；其余额度为后续阶段保留，不能挪用。':'';return ['plan','gap'].includes(w.stage)&&w.budget.modelAttempts>=workflowModelCeiling(w)?`本轮尚余 ${w.budget.modelLimit-w.budget.modelAttempts} 次请求，已为后续分析保留；当前规划阶段不能追加。请保留成果并结束本轮，新轮需重新确认请求上限。`:'';}
export function workflowAdvanceBlockReason(p:Project,w=p.workflow){
 if(!w)return '尚未创建一键研究。';
 if(w.status!=='ready')return '';
 if(['plan','analyze','gap','reanalyze','needs','commercial','verifier','synthesis'].includes(w.stage)&&w.budget.modelAttempts>=w.budget.modelLimit)return `本轮模型预算已用尽（请求次数 ${w.budget.modelAttempts} / ${w.budget.modelLimit}，包含工具后的模型调用），不代表账户免费额度耗尽。请导出已有成果并结束本轮；新一轮需另行确认请求上限。`;
 if(stageBudgetBlock(w))return stageBudgetBlock(w);
 if(collectionCloseout(p,w))return '';
 if(['collect','supplement'].includes(w.stage)&&(w.budget.searches>=w.budget.searchLimit||p.budget.searches>=6||w.budget.sourceAttempts+workflowSourceCap(w)>w.budget.sourceLimit))return '本轮采集预算不足以执行下一阶段。请导出已有成果并结束本轮，或人工导入资料后按新预算研究。';
 return '';
}
export function researchHasLease(p:Project){return !!(p.run?.lease||p.workflow?.lease||p.workflow?.conclusionAudit?.lease);}
export function unfinishedResearch(p:Project){return !!([p.workflow,p.run].some(r=>r&&['ready','running','paused'].includes(r.status))||p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status));}
export function workflowRetryBlockReason(p:Project){
  const w=p.workflow;if(!w||w.status!=='failed')return '当前没有失败步骤。';
  if(w.mode==='four'&&w.budget.stageLimit!==2&&!['check','deliver'].includes(w.stage))return '四角色预算仅覆盖各角色一次，失败请求仍占用预算；本轮不能追加重试。';
  if(['plan','analyze','gap','reanalyze','needs','commercial','verifier','synthesis'].includes(w.stage)&&w.budget.modelAttempts>=w.budget.modelLimit)return `本轮模型调用预算已用完（请求次数 ${w.budget.modelAttempts} / ${w.budget.modelLimit}），不能在原轮追加重试；账户余额和免费额度需在百炼核查。`;
  if(stageBudgetBlock(w))return stageBudgetBlock(w);
  if(w.budget.stageLimit===2&&['plan','analyze','gap','reanalyze','needs','commercial','verifier','synthesis'].includes(w.stage)&&!w.records.at(-1)?.preparation){const reason=modelRetryBlock(w.error);if(reason)return reason;}
  if(['collect','supplement'].includes(w.stage)&&(w.budget.sourceAttempts+workflowSourceCap(w)>w.budget.sourceLimit||w.budget.searches>=w.budget.searchLimit||p.budget.searches>=6))return '采集预算已用完，不能重试。';
  if(['check','deliver'].includes(w.stage)){const t=w.analysisRun?.tasks.find(t=>t.id===w.stage);if(!t||t.attempts>=2)return '该校验与保存步骤已达到重试上限。';}
  return '';
}
export function controlWorkflow(p:Project,action:'pause'|'resume'|'cancel'|'retry'|'recover'){
  const w=p.workflow;if(!w)throw new Error('尚未创建一键研究。');
  if(action==='cancel'){interrupt(w);w.status='cancelled';w.lease=undefined;return;}
  currentWorkflow(p);
  if(action==='pause'){if(!['ready','running','failed'].includes(w.status))throw new Error('当前不能暂停。');interrupt(w);w.status='paused';w.lease=undefined;return;}
  if(action==='resume'){if(w.status!=='paused'||['paused','cancelled'].includes(p.status))throw new Error('请先恢复项目研究。');w.status=w.needsRetry?'failed':'ready';return;}
  if(action==='recover'){if(!w.lease||Date.parse(w.lease.expires)>Date.now())throw new Error('检查点尚未过期。');interrupt(w);w.status='failed';w.lease=undefined;return;}
  const reason=workflowRetryBlockReason(p);if(reason)throw new Error(reason);
  if(['check','deliver'].includes(w.stage)||w.mode==='four'){const r=w.analysisRun!,t=r.tasks.find(t=>t.id===w.stage)!;t.status='pending';t.error='';r.status='ready';r.lease=undefined;}
  w.status='ready';w.needsRetry=false;w.error='';
}
export function normalizeQuery(query:string){return query.toLowerCase().replace(/\s+/g,' ').trim();}
export function mergeCollected(p:Project,w:ResearchWorkflow,collection:Collection){
  const usable=new Set(collection.usableIds),newIds:string[]=[];let added=0,duplicate=0,upgraded=0;
  for(const e of collection.evidence.filter(e=>usable.has(e.id)||e.contentBasis==='excerpt'&&e.text.trim().length>=40)){
    const old=p.evidence.find(x=>x.id===e.id||x.source===e.source&&x.thread===e.thread&&x.author===e.author&&x.text.trim()===e.text.trim());
    if(old){duplicate++;if(old.contentBasis==='excerpt'&&isAnalysisBody(e)){Object.assign(old,e,{id:old.id,excluded:old.excluded,stance:old.stance});upgraded++;}if(isAnalysisBody(old)&&!w.usableIds.includes(old.id))w.usableIds.push(old.id);continue;}
    if(p.evidence.length>=100){collection.limited=true;break;}
    p.evidence.push(e);newIds.push(e.id);added++;
  }
  w.usableIds=[...new Set([...w.usableIds,...newIds.filter(id=>usable.has(id))])];
  if(added||upgraded){invalidateRun(p);p.evidenceVersion=(p.evidenceVersion||0)+1;p.opportunities.forEach(o=>o.stale=true);w.evidenceVersion=p.evidenceVersion;}
  return {added,duplicate,titleOnly:collection.evidence.length-usable.size,newIds};
}
export function skipFetchedQueries(w:ResearchWorkflow){
  const fetched=new Set((w.agentFetchedQueries||[]).map(normalizeQuery));
  while(w.collectIndex<w.queries.length&&fetched.has(normalizeQuery(w.queries[w.collectIndex].query)))w.collectIndex++;
}
function interrupt(w:ResearchWorkflow){
  const record=w.records.find(r=>r.id===w.lease?.callId);if(!record)return;
  record.state='failed';record.error='EXECUTION_INTERRUPTED';record.elapsedMs=Date.now()-Date.parse(record.started);w.error=record.error;w.needsRetry=true;
  const r=w.analysisRun;if(r?.lease){const task=r.tasks.find(t=>t.id===r.lease?.taskId);if(task)failTask(r,task,record.error,r.lease.callId,record.elapsedMs);}
}
export function workflowReport(p:Project,w:ResearchWorkflow){
  const selected=p.evidence.filter(e=>(w.usableIds.includes(e.id)||w.mode!=='four'&&e.kind==='imported')&&isResearchEvidence(e,p.title+' '+p.audience));
  const coverage=sourceCoverage(w.frozen?.evidence||selected);
  const sources=w.records.filter(r=>r.collection).map(r=>{const c=r.collection!;return `- ${w.sourceProfile==='v2ex'?'节点订阅采样':r.stage==='supplement'?'补搜':'初搜'}「${c.query}」${c.routing?.goal?'（渠道目标：'+({general:'通用发现',capability:'已有能力与配置',feedback:'实际使用反馈',background:'背景与统计'}[c.routing.goal])+'；程序规则分配）':''}${c.routing&&c.routing.effectiveQuery!==c.query?'（社区检索词：'+c.routing.effectiveQuery+'；程序映射，非语义验证）':''}：新增 ${c.added} 条资料；重复 ${c.duplicate} 条；无可分析正文 ${c.titleOnly} 条；请求失败 ${c.failed} 次。`}).join('\n');
  const usage=workflowModelUsage(w);
  const directory=selected.slice(0,30).map(e=>`### [${e.id}] ${e.title}\n资料日期：${e.date||'未知'}；抓取时间：${e.fetched||'未知'}；讨论线程：${e.thread}；${e.truncated?'原文已裁剪':'已保存正文'}\n\n${e.applicationNote?'应用附注（非原文）：'+e.applicationNote+'\n':''}${e.sourceState?'抓取时 Issue 状态：'+e.sourceState+'\n':''}\n${e.text}\n\n${e.url}`).join('\n\n');
  const framing=w.framing?`目标用户：${w.framing.target_user}\n场景：${w.framing.scenario}\n研究问题：\n${w.framing.questions.map(q=>'- '+q).join('\n')}`:w.useExistingEvidence?'本轮复用已有原文直接分析，未重新调用规划或采集。':w.mode==='four'?'本轮是四角色复核，没有单角色规划结构。':w.sourceProfile==='v2ex'?'本轮使用操作者确认的研究范围，未调用模型规划检索词。':'模型未提供目标用户、场景和研究问题。应用没有补写。';
  const retrieved=w.retrieval?.length?`\n\n## 项目语料检索\n词面重叠，不是语义检索质量结论。命中 ${w.retrieval.length} 条当前项目原文。\n${w.retrieval.map(hit=>`- [${hit.id}] ${hit.title}`).join('\n')}`:'';
  const archive=`# 一键研究草稿：${p.title}\n\n**公开资料与模型推断，待人工核查；不代表市场或付费已验证。**\n研究版本：${p.revision}；资料版本：${p.evidenceVersion||0}；流程：${w.version}；模式：${w.mode==='four'?'四角色复核':'单角色研究'}\n模型请求尝试：${w.budget.modelAttempts} / ${w.budget.modelLimit}；有用量回执 ${usage.receipts} 次；输入 / 输出词元 ${usage.input} / ${usage.output}。缺失回执的用量未知。付费预算 ¥0，实际费用待百炼账单核对。\n\n## 研究问题\n${framing}${retrieved}\n\n## 来源覆盖\n${coverage.publicCount} 条公开正文；${coverage.importedCount} 条导入资料；${coverage.threadCount} 个讨论线程；${coverage.authorCount} 个已知作者标识；来源关联组 ${coverage.independentSamples} 个。同线程或同作者保守合并，未核实独立性；这些计数不是独立样本或客户数。裁剪正文 ${coverage.truncated} 条。\n${coverage.qualification.map(x=>'- '+x).join('\n')}\n时间过滤：${w.mode==='four'||w.useExistingEvidence?'本轮未检索，沿用已有资料；请核查原始日期与采集记录':w.since===null?'未使用日期过滤':new Date(w.since*1000).toISOString().slice(0,10)+' 以后'}\n\n${sources}\n\n${evidenceQualityReport(w.frozen?.evidence||selected)}\n## 机会与反证\n${w.analysisRun?.report||'未生成分析草稿。'}\n\n## 补证决策\n${w.records.filter(r=>r.stage==='gap').flatMap(r=>r.output?.gaps||[]).map(x=>'- '+x).join('\n')||(w.useExistingEvidence?'本轮复用已有资料，不进行自动补证。':w.mode==='four'?'本轮四角色复核不进行自动补搜。':!w.allowSupplement?'操作者未启用自动补证。':`本轮未执行补证决策；模型请求 ${w.budget.modelAttempts}/${w.budget.modelLimit}，来源请求 ${w.budget.sourceAttempts}/${w.budget.sourceLimit}，检索 ${w.budget.searches}/${w.budget.searchLimit}，请结合阶段记录核查受限资源。`)}${collaborationReport(w)}\n\n## 已知限制与下一步\n${w.limitations.map(x=>'- '+(x==='剩余预算不足以同时补搜和重新分析，本轮保留证据缺口。'?'本轮未进入补证；该历史记录未区分受限资源，不能据此认定模型请求耗尽。':x)).join('\n')}\n- 引用标识通过不等于原文支持程度已验证；付款、市场规模及访谈缺口需要另行核查。\n- 真实流程完成后另存待人工确认的机会草稿卡；没有自动确认正式机会卡或正式报告。\n\n## 证据目录\n${directory}\n`;
  return readerWorkflowReport(p,w,archive);
}
