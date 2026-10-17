import {renderEvidenceScope} from './evidence-scope';
import {claimKinds,claimKindLabels} from './claim-kinds';
import {z} from 'zod';
import {checkSchema,disagreementSchema,type ClaimCheck,type Disagreement} from './review-contract';
import {roleContext} from './governance';
import type {Project,Evidence} from './domain';
import type {Role,ModelTask,ModelResult,ResearchModelAdapter} from './model-port';
import {renderDemandCard,renderInterviewPlan,renderPublicSignals,renderQuoteLayers,type ConclusionReview,type DemandNote,type InterviewPlan} from './draft-cards';
export type {DemandNote,InterviewPlan,ConclusionReview};

export const EXECUTOR_VERSION='research-runner/2';
export const MOCK_MODEL='simulation-research/1';
export type Scenario='normal'|'timeout_once'|'invalid_once'|'foreign_reference';
export type Framing={target_user:string;scenario:string;questions:string[]};
export type EvidenceCitation={evidence_id:string;quote:string};
export type Proposal={title:string;problem:string;audience:string;alternative:string;conclusion:string;decision:'validate'|'evidence'|'pause';payment:'none'|'weak'|'medium';refs:string[];counter:string;unknowns:string;plan:string;demand?:DemandNote;interview?:InterviewPlan};
export type Analysis={notes:{claim:string;refs:string[];kind:typeof claimKinds[number]}[];proposal?:Proposal;framing?:Framing;citations?:EvidenceCitation[];checks?:ClaimCheck[];disagreements?:Disagreement[]};
export type Task={id:string;label:string;role:Role|null;deps:string[];status:'pending'|'running'|'done'|'failed';attempts:number;error:string;output?:ModelResult&{data:Analysis};inputSnapshot?:ModelTask;context?:{characters:number;evidenceIds:string[];omittedIds:string[];truncatedIds:string[];priorIds:string[];omittedMemoryIds:string[]};elapsedMs:number;calls:{id:string;error:string;elapsedMs:number;outputIssues?:string[];normalizations?:string[];usage?:ModelResult['usage'];requestId?:string}[]};
export type Run={reviewProtocol?:string;conclusionReview?:ConclusionReview;id:string;adapter:'simulation'|'qwen';model?:string;paidBudget?:0;freeTierOnlyConfirmed?:true;mode:'single'|'four';scenario:Scenario;executorVersion:string;revision:number;evidenceVersion:number;status:'ready'|'running'|'paused'|'failed'|'completed'|'cancelled'|'stale';created:string;updated:string;tasks:Task[];budget:{limit:number;attempts:number;requests?:number;contextChars:number};lease?:{callId:string;taskId:string;expires:string};report:string;simulation:boolean};
export type Evaluation={id:string;at:string;fixtureVersion:string;executorVersion:string;adapter:string;fixtureHash:string;simulation:true;results:{caseId:string;label:string;mode:'single'|'four';passed:boolean;checks:string[];attempts:number;contextChars:number;elapsedMs:number;status:string;errorCodes:string[];outputs:{taskId:string;role:Role;result:ModelResult}[]}[];semanticQuality:null;actualModelCalls:0;actualCost:0};
const str=z.string().trim().min(1).max(2000),ids=z.array(z.string().max(100)).max(30);
const line=z.union([str,z.object({text:str,evidence_ids:ids.optional()}).strict()]);
const demand=z.object({who:line.optional(),problem:line.optional(),effect:line.optional(),workaround:line.optional(),who_refs:ids.optional(),problem_refs:ids.optional(),effect_refs:ids.optional(),workaround_refs:ids.optional()}).strict();
const interview=z.object({questions:z.array(z.object({question:str,evidence_ids:ids.optional()}).strict()).max(8),decision_evidence:z.string().trim().min(1).max(2000).optional()}).strict();
const framing=z.object({target_user:z.string().trim().min(1).max(200),scenario:z.string().trim().min(1).max(500),questions:z.array(z.string().trim().min(1).max(200)).min(1).max(3)}).strict();
const citation=z.object({evidence_id:z.string().max(100),quote:z.string().min(12).max(240)}).strict();
const proposal=z.object({title:str,problem:str,audience:str,alternative:str,conclusion:str,decision:z.enum(['validate','evidence','pause']),payment:z.enum(['none','weak','medium']),refs:ids,counter:str,unknowns:str,plan:str,demand:demand.optional(),interview:interview.optional()}).strict();
const analysis=z.object({notes:z.array(z.object({claim:str,refs:ids,kind:z.enum(claimKinds)}).strict()).min(1).max(10),proposal:proposal.optional(),framing:framing.optional(),citations:z.array(citation).max(4).optional(),checks:z.array(checkSchema).max(4).optional(),disagreements:z.array(disagreementSchema).max(2).optional()}).strict();
const resultSchema=z.object({status:z.enum(['ok','partial','error']),data:analysis,evidence_ids:ids,gaps:z.array(z.string().max(2000)).max(20),errors:z.array(z.string().max(500)).max(10),revision:z.number().int().positive(),usage:z.object({input_tokens:z.number().int().min(0).max(100000),output_tokens:z.number().int().min(0).max(100000)}).strict(),model:z.string().min(1).max(200)}).strict();
export function makeRun(p:Project,mode:Run['mode'],scenario:Scenario='normal',limit=mode==='single'?4:8):Run{
  if(!p.confirmed)throw new Error('请先确认研究范围。');
  if(['paused','cancelled'].includes(p.status))throw new Error('请先恢复项目研究。');
  if(!p.evidence.some(e=>!e.excluded))throw new Error('请先添加至少一条未排除的原始资料。');
  if(p.run&&['ready','running','paused','failed'].includes(p.run.status))throw new Error('先完成或取消当前执行。');
  const specs:Pick<Task,'id'|'label'|'role'|'deps'>[]=mode==='single'?[{id:'research',label:'单角色研究',role:'coordinator',deps:[]}]:[
    {id:'needs',label:'分析用户需求',role:'needs',deps:[]},
    {id:'commercial',label:'分析替代与商业假设',role:'commercial',deps:['needs']},
    {id:'verifier',label:'独立核查原始资料',role:'verifier',deps:[]},
    {id:'synthesis',label:'汇总条件性判断',role:'coordinator',deps:['needs','commercial','verifier']},
  ];
  specs.push({id:'check',label:'校验结构与引用',role:null,deps:specs.map(t=>t.id)},{id:'deliver',label:'保存研究草稿',role:null,deps:['check']});
  const now=new Date().toISOString();return {id:crypto.randomUUID(),adapter:'simulation',mode,scenario,executorVersion:EXECUTOR_VERSION,revision:p.revision,evidenceVersion:p.evidenceVersion||0,status:'ready',created:now,updated:now,tasks:specs.map(t=>({...t,status:'pending',attempts:0,error:'',elapsedMs:0,calls:[]})),budget:{limit,attempts:0,contextChars:16000},report:'',simulation:true};
}
export function currentRun(p:Project){if(!p.run)throw new Error('尚未创建执行任务。');const r=p.run;if(r.revision!==p.revision||r.evidenceVersion!==(p.evidenceVersion||0)||r.status==='stale')throw new Error('执行依据已变更，请取消旧执行并重新开始。');return r;}
export function nextTask(r:Run){return r.tasks.find(t=>t.status==='pending'&&t.deps.every(id=>r.tasks.find(x=>x.id===id)?.status==='done'));}
function selectedEvidence(p:Project):Evidence[]{
  const active=p.evidence.filter(e=>!e.excluded),counter=active.filter(e=>e.stance==='counter'),ordered=[...counter.slice(0,3),...active.filter(e=>e.stance!=='counter'),...counter.slice(3)],seen=new Set<string>();
  const unique=ordered.filter(e=>{const key=e.thread||e.id;if(seen.has(key))return false;seen.add(key);return true});
  return [...unique,...ordered.filter(e=>!unique.includes(e))].slice(0,12);
}
export function buildTask(p:Project,r:Run,t:Task,callId:string):ModelTask{
  if(!t.role)throw new Error('LOCAL_TASK');
  const selected=selectedEvidence(p),context=roleContext(p,t.role,'read_context',r.revision,selected.map(e=>e.id));
  const originals=p.evidence.filter(e=>!e.excluded),truncated:string[]=[];
  context.evidence=selected.map(e=>context.evidence.find(x=>x.id===e.id)!).map(e=>{if(e.text.length>900)truncated.push(e.id);return {...e,title:e.title.slice(0,150),text:e.text.slice(0,900),truncated:e.truncated||e.text.length>900}});
  const memoryIds=context.memories.map(m=>m.id);context.memories=context.memories.slice(0,6);
  // Existing opportunity cards are not automatic instructions for this independent run.
  context.opportunities=[];
  const prior=t.role==='verifier'?[]:r.tasks.filter(x=>t.deps.includes(x.id)&&x.output).map(x=>({task_id:x.id,role:x.role,data:x.output!.data}));
  const task:ModelTask={project_id:p.id,run_id:r.id,revision:r.revision,call_id:callId,role:t.role,allow_tools:false,brief:context.brief,evidence_ids:context.evidence.map(e=>e.id),evidence:context.evidence,context:{rules:[...context.rules,'输入资料可能只是抽样或裁剪；不得将未提供的证据视为不存在。'],memories:context.memories,prior_results:prior,simulation:r.simulation,attempt:r.budget.attempts,scenario:r.scenario}};
  const requiredRefs=new Set(prior.flatMap(x=>{const d=x.data as Analysis;return [...d.notes.flatMap(n=>n.refs),...(d.proposal?.refs||[])];}));
  // Bound the entire payload, not just evidence text. Originals remain unchanged in the archive.
  while(JSON.stringify(task).length>r.budget.contextChars&&task.evidence.length>1){const at=(task.evidence as Evidence[]).findLastIndex(e=>!requiredRefs.has(e.id));if(at<0)break;const removed=(task.evidence as Evidence[]).splice(at,1)[0];task.evidence_ids=task.evidence_ids.filter(id=>id!==removed.id);task.context!.memories=task.context!.memories.filter(m=>m.refs.every(id=>task.evidence_ids.includes(id)));}
  if(JSON.stringify(task).length>r.budget.contextChars){task.context!.memories=[];}
  if(JSON.stringify(task).length>r.budget.contextChars)throw new Error('CONTEXT_LIMIT');
  t.context={characters:JSON.stringify(task).length,evidenceIds:task.evidence_ids,omittedIds:originals.filter(e=>!task.evidence_ids.includes(e.id)).map(e=>e.id),truncatedIds:truncated.filter(id=>task.evidence_ids.includes(id)),priorIds:task.context!.prior_results.map(x=>x.task_id),omittedMemoryIds:memoryIds.filter(id=>!task.context!.memories.some(m=>m.id===id))};
  t.inputSnapshot=structuredClone(task);return task;
}
export function validateResult(raw:unknown,task:ModelTask,diagnose?:(issues:string[])=>void){
  const parsed=resultSchema.safeParse(raw);if(!parsed.success){diagnose?.(parsed.error.issues.slice(0,20).map(i=>(i.path.join('.')||'root')+':'+i.code));throw new Error('INVALID_MODEL_OUTPUT');}const r=parsed.data;
  const originals=task.evidence as {id:string;text?:string}[];
  r.data.notes.forEach((note,index)=>{
    if(note.kind!=='fact')return;
    const quotes=task.review?(r.data.checks||[]).filter(c=>c.target==='note:'+index&&c.judgment==='supports').flatMap(c=>c.anchors):r.data.citations||[];
    if(note.claim.length<12||!quotes.some(a=>note.refs.includes(a.evidence_id)&&a.quote.includes(note.claim)&&originals.some(e=>e.id===a.evidence_id&&typeof e.text==='string'&&e.text.includes(a.quote)))){
      diagnose?.([`data.notes.${index}.kind:fact_requires_literal_source`]);throw new Error('INVALID_EVIDENCE_QUOTE');
    }
  });
  if(r.revision!==task.revision)throw new Error('OUTPUT_REVISION_MISMATCH');
  if(r.status==='error')throw new Error('MODEL_REPORTED_ERROR');
  const cardRefs=r.data.proposal?.demand?[...r.data.proposal.demand.who_refs||[],...r.data.proposal.demand.problem_refs||[],...r.data.proposal.demand.effect_refs||[],...r.data.proposal.demand.workaround_refs||[],...(['who','problem','effect','workaround'] as const).flatMap(key=>{const field=r.data.proposal?.demand?.[key];return field&&typeof field==='object'?field.evidence_ids||[]:[];})]:[];
  const interviewRefs=r.data.proposal?.interview?.questions.flatMap(item=>item.evidence_ids||[])||[];
  const nested=[...r.data.notes.flatMap(n=>n.refs),...(r.data.proposal?.refs||[]),...cardRefs,...interviewRefs,...(r.data.checks||[]).flatMap(c=>c.anchors.map(a=>a.evidence_id)),...(r.data.disagreements||[]).flatMap(d=>d.refs)];
  if([...r.evidence_ids,...nested].some(id=>!task.evidence_ids.includes(id))){diagnose?.(['refs:outside_input']);throw new Error('INVALID_MODEL_REFERENCE');}if(nested.some(id=>!r.evidence_ids.includes(id))){diagnose?.(['evidence_ids:missing_nested_refs']);throw new Error('INVALID_MODEL_REFERENCE');}
  if(task.role==='coordinator'&&!r.data.proposal)throw new Error('MISSING_PROPOSAL');
  return r;
}
export class SimulationModel implements ResearchModelAdapter{
  async execute(task:ModelTask,signal:AbortSignal):Promise<ModelResult>{
    if(signal.aborted)throw new Error('MODEL_TIMEOUT');
    const scenario=task.context?.scenario,attempt=task.context?.attempt||1;
    if(scenario==='timeout_once'&&attempt===1)await new Promise<never>((_,reject)=>{const abort=()=>reject(new Error('MODEL_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()});
    if(scenario==='invalid_once'&&attempt===1)return {malformed:true} as unknown as ModelResult;
    const evidence=task.evidence as Evidence[],refs=evidence.slice(0,3).map(e=>e.id),counter=evidence.find(e=>e.stance==='counter');
    const data:Analysis={notes:[{claim:'模拟输出：已收到限定原始资料，尚未进行真实语义分析。',refs,kind:'hypothesis'},{claim:counter?'模拟输出：存在人工标记的反向资料，需要回到原文核查。':'模拟输出：未提供人工标记的反证；不表示反例不存在。',refs:counter?[counter.id]:[],kind:counter?'counter':'gap'}]};
    if(task.role==='coordinator')data.proposal={title:'模拟研究草稿 · 待真实模型分析',problem:'待从原始资料核实具体问题与影响。',audience:task.brief.audience||'待确认',alternative:'已有替代及成本待核实。',conclusion:'模拟结果只验证流程，没有得出真实产品机会结论。',decision:'evidence',payment:'none',refs,counter:'需独立核查反例与不愿改变的用户。',unknowns:'问题频次、受影响用户、付费依据、采购者与切换成本均未验证。',plan:'人工核对原文与引用，接入真实模型后用相同资料复测；未核实关键问题前暂缓投入。',demand:{who:task.brief.audience||'待确认',problem:'待从原始资料核实具体问题。',effect:'影响尚未由资料证明。',workaround:'已有替代及成本待核实。'}};
    if(scenario==='foreign_reference'){data.notes[0].refs=['FOREIGN_EVIDENCE'];}
    return {status:'partial',data,evidence_ids:Array.from(new Set([...refs,...(counter?[counter.id]:[])])),gaps:['模拟输出，未评估语义正确性或市场机会。'],errors:[],revision:task.revision,usage:{input_tokens:0,output_tokens:0},model:MOCK_MODEL};
  }
}
export async function executeModel(task:ModelTask,adapter:ResearchModelAdapter,timeoutMs=4000){
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([adapter.execute(structuredClone(task),controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('MODEL_TIMEOUT'))},timeoutMs)})]);}finally{clearTimeout(timer);controller.abort();}
}
export function reserve(p:Project,callId:string){const r=currentRun(p);if(!['ready','running'].includes(r.status)||r.lease)throw new Error('执行未就绪，或有步骤正在运行。');const t=nextTask(r);if(!t)throw new Error('没有可推进的步骤。');if(t.role&&r.budget.attempts>=r.budget.limit)throw new Error('已达到本次调用上限；可取消后调整预算重新执行。');if(t.attempts>=2)throw new Error('该步骤已达到最多两次尝试。');t.attempts++;t.status='running';t.error='';r.status='running';r.updated=new Date().toISOString();r.lease={callId,taskId:t.id,expires:new Date(Date.now()+(r.adapter==='qwen'?75000:15000)).toISOString()};if(t.role)r.budget.attempts++;return {run:r,task:t};}
export function failTask(r:Run,t:Task,error:string,callId:string,elapsedMs:number){t.status='failed';t.error=error;t.elapsedMs+=elapsedMs;t.calls.push({id:callId,error,elapsedMs});r.status='failed';r.lease=undefined;r.updated=new Date().toISOString();}
export function completeTask(r:Run,t:Task,callId:string,elapsedMs:number){t.status='done';t.elapsedMs+=elapsedMs;t.calls.push({id:callId,error:'',elapsedMs});r.lease=undefined;r.updated=new Date().toISOString();r.status=t.id==='deliver'?'completed':'ready';}
export function localStep(p:Project,r:Run,t:Task){
  if(t.id==='check'){
    for(const item of r.tasks.filter(x=>x.role)){
      if(!item.output)throw new Error('MISSING_ROLE_OUTPUT');
      if(item.output.evidence_ids.some(id=>!p.evidence.some(e=>e.id===id&&!e.excluded)))throw new Error('INVALID_MODEL_REFERENCE');
    }
  }
  if(t.id==='deliver'){
    const final=r.tasks.find(x=>x.role==='coordinator')?.output?.data.proposal;if(!final)throw new Error('MISSING_PROPOSAL');
    const coordinatorTask=r.tasks.find(x=>x.role==='coordinator'),coordinator=coordinatorTask?.output?.data,notes=coordinator?.notes||[],kindLabel=claimKindLabels;
    const labeled=claimKinds.map(kind=>`### 模型标记为${kindLabel[kind]}\n${notes.filter(n=>n.kind===kind).map(n=>`- ${n.claim} ${n.refs.map(id=>'['+id+']').join(' ')}`.trim()).join('\n')||'- 无'}`).join('\n');
    const quotes=(coordinator?.citations||[]).map(item=>({...item,located:p.evidence.some(source=>source.id===item.evidence_id&&source.text.includes(item.quote))}));
    r.report=`# ${r.simulation?'模拟研究草稿':'模型研究草稿'}：${p.title}\n\n${r.simulation?'**模拟模型，未做真实语义分析，不构成市场研究结论。**':'**真实模型生成的条件性草稿；语义与引用支持程度仍需人工核查。**'}\n执行编号：${r.id}\n模式：${r.mode==='single'?'单角色基线':'四角色固定编排'}\n研究版本：${r.revision}；资料版本：${r.evidenceVersion}\n${r.simulation?`模拟调用：${r.budget.attempts}；真实模型调用：0；实际模型费用：0`:`真实请求尝试：${r.budget.requests||0}（含失败及未确认请求）；付费预算：¥0；实际费用：待百炼账单核对。仅允许免费额度用完即停已生效时运行。已确认输入/输出词元：${r.tasks.flatMap(t=>t.calls).reduce((n,c)=>n+(c.usage?.input_tokens||0),0)} / ${r.tasks.flatMap(t=>t.calls).reduce((n,c)=>n+(c.usage?.output_tokens||0),0)}；缺失用量不按零计。`}\n\n${renderDemandCard(final.demand,p.evidence)}\n\n${renderInterviewPlan(final.interview,p.evidence)}\n\n## 机会草稿\n${final.title}\n问题：${final.problem}\n人群：${final.audience}\n已有替代：${final.alternative}\n${final.conclusion}\n决策：${final.decision}；模型付费信号：${final.payment}\n反证：${final.counter}\n\n引用：${final.refs.map(id=>'['+id+']').join(' ')}\n未知项：${final.unknowns}\n\n${renderEvidenceScope(coordinatorTask?.inputSnapshot?.evidence||[],final.refs)}\n\n## 验证计划\n${final.plan}\n\n${renderPublicSignals(quotes,final.payment)}\n\n${renderQuoteLayers(notes,coordinator?.citations,p.evidence)}\n\n## 模型主张分类\n以下分类只复述模型输出的 kind。fact 仅表示可逐字定位的资料原文陈述；来源本身及交易真实性尚未独立核实。\n${labeled}\n\n## 执行限制\n真实研究完成后另存待人工确认的机会草稿卡，不自动保存正式报告；引用可定位不等于支持结论。需求卡上的资料标识来自该行已写的引用或当前项目词面重叠，不是语义检索，也没有外部向量库。上下文按反证优先、不同线程优先裁剪。部分原文可能省略，完整资料仍保留在证据库。\n`;
  }
}
export function invalidateRun(p:Project){if(p.run&&p.run.status!=='cancelled'){p.run.status='stale';p.run.lease=undefined;}}
export const errorLabels:Record<string,string>={PROVIDER_SCHEMA_UNSUPPORTED:'结构化格式含服务不支持的约束，已在应用内停止，未发起模型请求',EMBEDDING_NOT_CONFIGURED:'语义检索尚未配置独立向量模型的免费保护确认',EMBEDDING_FORBIDDEN:'向量模型拒绝请求，请检查权限和该模型免费额度',EMBEDDING_BUDGET:'本轮向量请求已达到两次上限',INVALID_EMBEDDING_RESPONSE:'向量响应维度或用量格式无效',EMBEDDING_INPUT_LIMIT:'向量输入超出上限',MODEL_BUDGET:'本轮模型请求次数已达到应用上限，不代表账户余额或免费额度耗尽',MODEL_STAGE_BUDGET:'当前阶段请求上限已达到，剩余请求已为后续分析保留',TOOL_FINALIZATION_REQUIRED:'本阶段需返回最终结果，模型仍要求工具；未执行该工具或追加请求',SOURCE_BUDGET:'来源请求预算已用完',OPPORTUNITY_CAPACITY:'机会卡已达到容量上限，请整理后再保存',FROZEN_MEMORY_EXPIRED:'本轮固定记忆已过期或失效，请重新研究',INVALID_EVIDENCE_QUOTE:'引用片段无法在本次输入原文中定位',INVALID_REVIEW_COVERAGE:'核查条目、角色字段或引用不符合约定',BASELINE_INPUT_CHANGED:'旧基线输入与当前原文不一致',MODEL_TIMEOUT:'步骤超时',INVALID_MODEL_OUTPUT:'输出不符合结构',INVALID_MODEL_REFERENCE:'输出引用越界',OUTPUT_REVISION_MISMATCH:'输出研究版本不一致',MISSING_PROPOSAL:'缺少研究草稿',MODEL_REPORTED_ERROR:'模型返回错误',CONTEXT_LIMIT:'上下文超出上限',EXECUTION_INTERRUPTED:'执行中断，结果未确认',MISSING_ROLE_OUTPUT:'缺少角色输出',FREE_QUOTA_EXHAUSTED:'免费额度已耗尽，百炼已拒绝请求；不会自动切换付费或其他模型',PROVIDER_REDIRECT_REJECTED:'服务地址返回重定向，已停止且未转发密钥',PROVIDER_AUTH_ERROR:'API Key 无效，请检查北京业务空间',PROVIDER_FORBIDDEN:'模型或业务空间访问被拒绝',PROVIDER_RATE_LIMIT:'服务限流；没有自动重试',PROVIDER_CONFIG_ERROR:'模型标识或结构化参数被服务拒绝',PROVIDER_UNAVAILABLE:'模型服务暂时不可用',PROVIDER_NETWORK_ERROR:'模型服务连接失败，是否到达服务端尚未确认',INVALID_PROVIDER_RESPONSE:'服务响应或用量信息不完整',MODEL_OUTPUT_TRUNCATED:'输出达到词元上限，未保存不完整草稿'};
