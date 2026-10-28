import type {Project} from './domain';
import type {DiagnosticDatabase} from './generation-diagnostic';
export const FLOW_ACCEPTANCE_ID='2994fd2a-e8ab-468a-a1a5-36746f9f6343';
export const FLOW_ACCEPTANCE_EXPIRES='2026-10-29T15:59:59.000Z';
const binding='research-flow/1:single:no-supplement:model4:source30';
type Reply={status:number;data:{project?:Project;error?:string}};
export type AcceptanceCall=(path:string,method:string,body?:unknown)=>Promise<Reply>;
export type FlowReport={test:string;runId:string;buildRef:string;state:string;stage:string;projectId?:string;modelAttempts:number;maxModelRequests:4;sourceAttempts:number;maxSourceRequests:30;steps:{stage:string;state:string;modelAttempts:number}[];errorCode?:string;routeError?:string;issues?:string[];usage?:{input_tokens:number;output_tokens:number};requestIds?:string[];evidenceCount?:number;draftCount?:number;reportSaved?:boolean;duplicateStageDidNotCallModel?:boolean;pauseResumePreserved?:boolean;checkpoints?:number;confirmedOperations?:number;unknownOperations?:number;checkpointRecoveryTested:false;updated:string};
const initial=(buildRef:string):FlowReport=>({test:'research-flow/1',runId:FLOW_ACCEPTANCE_ID,buildRef,state:'not_started',stage:'create',modelAttempts:0,maxModelRequests:4,sourceAttempts:0,maxSourceRequests:30,steps:[],checkpointRecoveryTested:false,updated:new Date().toISOString()});
export async function readFlowAcceptance(db:DiagnosticDatabase):Promise<FlowReport>{
 const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_flow_acceptance'").first();
 if(!exists)return initial('');
 const row=await db.prepare('SELECT report,updated FROM research_flow_acceptance WHERE run_id=?').bind(FLOW_ACCEPTANCE_ID).first<{report:string;updated:string}>();
 if(!row)return initial('');
 const report=JSON.parse(row.report) as FlowReport;
 if(report.state==='running'&&Date.now()-Date.parse(row.updated)>360000)report.state='result_unknown';
 return report;
}
export async function claimFlowAcceptance(db:DiagnosticDatabase,buildRef:string,now=Date.now()){
 if(now>Date.parse(FLOW_ACCEPTANCE_EXPIRES))return {claimed:false,report:{...initial(buildRef),state:'authorization_expired'}};
 await db.prepare('CREATE TABLE IF NOT EXISTS research_flow_acceptance (run_id TEXT PRIMARY KEY,binding TEXT NOT NULL,state TEXT NOT NULL,report TEXT NOT NULL,updated TEXT NOT NULL)').run();
 const report={...initial(buildRef),state:'running'};
 const claim=await db.prepare("INSERT INTO research_flow_acceptance VALUES (?,?,'started',?,?) ON CONFLICT(run_id) DO NOTHING").bind(FLOW_ACCEPTANCE_ID,binding,JSON.stringify(report),new Date(now).toISOString()).run();
 return claim.meta.changes?{claimed:true,report}:{claimed:false,report:await readFlowAcceptance(db)};
}
function recordProject(report:FlowReport,p:Project){
 report.projectId=p.id;const w=p.workflow;
 report.modelAttempts=w?.budget.modelAttempts||0;report.sourceAttempts=w?.budget.sourceAttempts||0;
 report.evidenceCount=p.evidence.length;report.draftCount=p.opportunities.filter(o=>o.status==='draft').length;
 const records=w?.records||[];
 report.requestIds=[...new Set(records.flatMap(r=>[r.requestId,...(r.agentModelReceipts||[]).map(x=>x.requestId)]).filter((id):id is string=>typeof id==='string'&&/^[\w-]{1,100}$/.test(id)))];
 const usages=records.flatMap(r=>r.usage?[r.usage]:[]);
 if(usages.length)report.usage=usages.reduce((a,u)=>({input_tokens:a.input_tokens+u.input_tokens,output_tokens:a.output_tokens+u.output_tokens}),{input_tokens:0,output_tokens:0});
 const failed=records.filter(r=>r.state==='failed').at(-1);
 if(failed?.outputIssues)report.issues=failed.outputIssues.slice(0,20);
}
export async function executeFlowAcceptance({db,buildRef,call}:{db:DiagnosticDatabase;buildRef:string;call:AcceptanceCall}){
 // Only the holder of the atomic claim calls this function. No resume/retry path.
 const owned=await db.prepare('SELECT binding,state,report FROM research_flow_acceptance WHERE run_id=?').bind(FLOW_ACCEPTANCE_ID).first<{binding:string;state:string;report:string}>();
 if(!owned||owned.binding!==binding||owned.state!=='started')throw Error('FLOW_ACCEPTANCE_CLAIM_REQUIRED');
 let report=JSON.parse(owned.report) as FlowReport,p:Project|undefined;
 if(report.buildRef!==buildRef||report.projectId)throw Error('FLOW_ACCEPTANCE_ALREADY_STARTED');
 async function save(final=false){
  report.updated=new Date().toISOString();
  const saved=await db.prepare("UPDATE research_flow_acceptance SET state=?,report=?,updated=? WHERE run_id=? AND binding=? AND state='started'").bind(final?'finished':'started',JSON.stringify(report),report.updated,FLOW_ACCEPTANCE_ID,binding).run();
  if(!saved.meta.changes)throw Error('FLOW_ACCEPTANCE_RECEIPT_UNCONFIRMED');
  console.info('[jianwei-flow-acceptance]',JSON.stringify(report));
 }
 async function request(path:string,method:string,body?:unknown){
  const result=await call(path,method,body);
  if(result.status!==200||!result.data.project){report.routeError=result.data.error?.slice(0,300);throw Error('FLOW_ROUTE_REJECTED');}
  p=result.data.project;recordProject(report,p);return p;
 }
 const patch=(action:string)=>request('/api/projects/'+p!.id,'PATCH',{version:p!.version,callId:crypto.randomUUID(),action});
 const action=(name:string,callId=crypto.randomUUID(),version=p!.version)=>request('/api/projects/'+p!.id+'/workflow','POST',{version,callId,action:name,mode:'single',allowSupplement:false,freeTierOnlyConfirmed:true,sourceProfile:'public'});
 try{
  await save();
  await request('/api/projects','POST',{title:'验收：SaaS 客户上线交接遗漏与重复确认',audience:'B 端 SaaS 的实施顾问、销售、客户成功经理和客户管理员',region:'中国大陆；公开技术社区仅作为补充线索',period:'近一年',exclusions:'只用于工程验收。聚焦签约后到首次正式使用，不讨论获客、合同审批和续费；不预设必须使用 AI；公开资料不等于真实客户访谈。',decision:'识别上线交接遗漏、责任不清和重复确认的候选问题。保留反证、来源偏差与未知，引用原文，提出条件性的最小验证方案，不虚构付款、比例或研究结论。'});
  await save();await patch('confirm');await action('start');
  if(p!.workflow?.budget.modelLimit!==4||p!.workflow.allowSupplement||p!.workflow.mode!=='single'||p!.workflow.harnessVersion!=='research-harness/1')throw Error('FLOW_BUDGET_OR_RUNTIME_MISMATCH');
  const currentState=()=>String(p?.workflow?.status||'');
  let controlChecked=false,lastCall:{id:string;version:number}|undefined;
  for(let step=0;step<12&&currentState()==='ready';step++){
   const w=p!.workflow!;
   if(w.budget.modelAttempts>4||w.budget.sourceAttempts>30)throw Error('FLOW_BUDGET_MISMATCH');
   report.stage=w.stage;await save();
   const id=crypto.randomUUID(),version=p!.version;lastCall={id,version};
   await action('advance',id,version);
   report.steps.push({stage:report.stage,state:p!.workflow!.status,modelAttempts:p!.workflow!.budget.modelAttempts});await save();
   if(p!.workflow!.status==='failed')throw Error(p!.workflow!.error||'FLOW_STAGE_FAILED');
   if(!controlChecked&&p!.workflow!.status==='ready'){
    const count=p!.workflow!.budget.modelAttempts,records=p!.workflow!.records.length,stage=p!.workflow!.stage;
    await action('advance',id,version);
    if(p!.workflow!.budget.modelAttempts!==count||p!.workflow!.records.length!==records)throw Error('FLOW_DUPLICATE_STAGE_CHANGED');
    report.duplicateStageDidNotCallModel=true;
    await action('pause');await request('/api/projects/'+p!.id,'GET');
    if(p!.workflow!.status!=='paused'||p!.workflow!.budget.modelAttempts!==count)throw Error('FLOW_PAUSE_NOT_PRESERVED');
    await action('resume');await request('/api/projects/'+p!.id,'GET');
    if(p!.workflow!.status!=='ready'||p!.workflow!.stage!==stage||p!.workflow!.budget.modelAttempts!==count)throw Error('FLOW_RESUME_NOT_PRESERVED');
    report.pauseResumePreserved=true;controlChecked=true;await save();
   }
  }
  if(p!.workflow?.status!=='completed')throw Error(p!.workflow?.error||'FLOW_NOT_COMPLETED');
  const count=p!.workflow.budget.modelAttempts,drafts=p!.opportunities.length;
  if(!drafts||!p!.opportunities.some(o=>o.status==='draft'&&o.refs.length&&o.refs.every(id=>p!.evidence.some(e=>e.id===id))))throw Error('FLOW_DRAFT_OR_REFERENCES_MISSING');
  if(lastCall)await action('advance',lastCall.id,lastCall.version);
  if(p!.workflow!.budget.modelAttempts!==count||p!.opportunities.length!==drafts)throw Error('FLOW_DELIVERY_REPLAY_CHANGED');
  await patch('report');await request('/api/projects/'+p!.id,'GET');
  report.reportSaved=!!p!.reports.length&&!!p!.workflow!.report;
  if(!report.reportSaved)throw Error('FLOW_REPORT_NOT_SAVED');
  const prefix=p!.id+':%';
  const checkpoints=await db.prepare('SELECT COUNT(*) AS n FROM research_harness_checkpoints WHERE thread_id LIKE ?').bind(prefix).first<{n:number}>();
  const done=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id LIKE ? AND state='done'").bind(prefix).first<{n:number}>();
  const unknown=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id LIKE ? AND state IN ('started','uncertain')").bind(prefix).first<{n:number}>();
  report.checkpoints=checkpoints?.n||0;report.confirmedOperations=done?.n||0;report.unknownOperations=unknown?.n||0;
  if(!report.checkpoints||!report.confirmedOperations||report.unknownOperations)throw Error('FLOW_HARNESS_RECEIPTS_INCOMPLETE');
  report.state='success';report.stage='completed';await save(true);
 }catch(error){
  if(p)try{await request('/api/projects/'+p.id,'GET')}catch{}
  const code=error instanceof Error?error.message:'';
  report.errorCode=/^[A-Z][A-Z0-9_]{0,99}$/.test(code)?code:'FLOW_ACCEPTANCE_FAILED';report.state='failed';await save(true);
 }
 return report;
}
