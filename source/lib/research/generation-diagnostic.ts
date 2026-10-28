import {QWEN_BASE_URL,QWEN_MODEL} from './provider-config';
import {providerNetworkIssue} from './provider-network';
import {providerErrorIssues} from './qwen-schema';
// One owner-authorized generation across all deployments, restarts and visitors.
export const DIAGNOSTIC_RUN_ID='77ce7933-87fa-454c-92f5-dbbd37cd1c13';
export const DIAGNOSTIC_EXPIRES='2026-10-29T15:59:59.000Z';
const BINDING='runtime-connection/1:'+QWEN_MODEL+':'+QWEN_BASE_URL+':max_tokens=16';
type Statement={bind(...values:unknown[]):Statement;run():Promise<{meta:{changes:number}}>;first<T>():Promise<T|null>};
export type DiagnosticDatabase={prepare(sql:string):Statement};
type Row={binding:string;state:string;report:string|null};
export type DiagnosticReport={test:string;runId:string;buildRef:string;model:string;modelRequestAttempts:number;requestAttemptsThisInvocation:number;maxOutputTokens:number;state:string;httpStatus?:number;issues?:string[];requestId?:string;usage?:{input_tokens:number;output_tokens:number};elapsedMs?:number;reused?:boolean;persistenceConfirmed?:boolean};
const base=(buildRef:string):DiagnosticReport=>({test:'runtime-connection/1',runId:DIAGNOSTIC_RUN_ID,buildRef,model:QWEN_MODEL,modelRequestAttempts:0,requestAttemptsThisInvocation:0,maxOutputTokens:16,state:'not_started'});
const safeId=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)?value:undefined;
export async function readGenerationDiagnostic(db:DiagnosticDatabase){
 const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_connection_diagnostics'").first();
 if(!exists)return base('');
 const row=await db.prepare('SELECT binding,state,report FROM research_connection_diagnostics WHERE run_id=?').bind(DIAGNOSTIC_RUN_ID).first<Row>();
 if(!row)return base('');
 if(row.report)return {...JSON.parse(row.report),reused:true,requestAttemptsThisInvocation:0} as DiagnosticReport;
 return {...base(''),modelRequestAttempts:1,state:'result_unknown',reused:true};
}
export async function runGenerationDiagnostic({db,key,buildRef,fetcher=fetch,now=Date.now()}:{db:DiagnosticDatabase;key:string;buildRef:string;fetcher?:typeof fetch;now?:number}):Promise<DiagnosticReport>{
 let report=base(buildRef);
 if(now>Date.parse(DIAGNOSTIC_EXPIRES))return {...report,state:'authorization_expired'};
 await db.prepare('CREATE TABLE IF NOT EXISTS research_connection_diagnostics (run_id TEXT PRIMARY KEY,binding TEXT NOT NULL,state TEXT NOT NULL,report TEXT,updated TEXT NOT NULL)').run();
 const claim=await db.prepare("INSERT INTO research_connection_diagnostics VALUES (?,?,'started',NULL,?) ON CONFLICT(run_id) DO NOTHING").bind(DIAGNOSTIC_RUN_ID,BINDING,new Date(now).toISOString()).run();
 if(!claim.meta.changes){
  const row=await db.prepare('SELECT binding,state,report FROM research_connection_diagnostics WHERE run_id=?').bind(DIAGNOSTIC_RUN_ID).first<Row>();
  if(row?.binding!==BINDING)return {...report,state:'authorization_mismatch'};
  return row.report?{...JSON.parse(row.report),reused:true,requestAttemptsThisInvocation:0}:{...report,modelRequestAttempts:1,state:'result_unknown',reused:true};
 }
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 report={...report,modelRequestAttempts:1,requestAttemptsThisInvocation:1,state:'result_unknown'};
 try{
  const response=await fetcher(QWEN_BASE_URL+'/chat/completions',{method:'POST',redirect:'manual',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:QWEN_MODEL,messages:[{role:'user',content:'Reply with OK.'}],stream:false,enable_thinking:false,max_tokens:16,temperature:0})});
  report.httpStatus=response.status;
  let body:any;try{body=await response.json();}catch{report.state='response_unreadable';}
  const id=safeId(response.headers.get('x-request-id'))||safeId(body?.request_id)||safeId(body?.id);
  if(id)report.requestId=id;
  if(!response.ok){report.state=response.status>=300&&response.status<400?'redirect_rejected':'http_error';report.issues=providerErrorIssues(response.status,body);}
  else if(body){
   const input=body?.usage?.prompt_tokens,output=body?.usage?.completion_tokens;
   if(Number.isSafeInteger(input)&&input>=0&&Number.isSafeInteger(output)&&output>=0)report.usage={input_tokens:input,output_tokens:output};
   report.state=report.usage&&typeof body?.choices?.[0]?.message?.content==='string'?'success':'response_incomplete';
  }
 }catch(error){report.state='transport_error';report.issues=[providerNetworkIssue(error,controller.signal.aborted)];}
 finally{clearTimeout(timer)}
 report.elapsedMs=Date.now()-started;
 const saved=await db.prepare("UPDATE research_connection_diagnostics SET state='finished',report=?,updated=? WHERE run_id=? AND binding=? AND state='started'").bind(JSON.stringify({...report,persistenceConfirmed:true}),new Date().toISOString(),DIAGNOSTIC_RUN_ID,BINDING).run();
 report.persistenceConfirmed=!!saved.meta.changes;
 console.info('[jianwei-runtime-connection]',JSON.stringify(report));
 return report;
}
