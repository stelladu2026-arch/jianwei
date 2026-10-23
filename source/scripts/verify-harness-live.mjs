// Explicit, bounded server-side acceptance. Ordinary builds never call a model.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true}}return next(specifier,context)}});
const VERSION='harness-live-acceptance/1';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const safeCode=error=>/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message||'')?error.message:'LIVE_ACCEPTANCE_FAILED';

export async function verifyHarnessAcceptance({db,adapter,runId,buildRef}){
 if(!uuid.test(runId)||!buildRef)throw Error('ACCEPTANCE_GRANT_REQUIRED');
 const {runResearchHarness}=await import('../lib/research/harness/runner.ts');
 const {ResearchCheckpointSaver}=await import('../lib/research/harness/checkpointer.ts');
 const {saveStageInput}=await import('../lib/research/harness/recovery.ts');
 const {executeAgentTurn}=await import('../lib/research/model-turn.ts');
 const {acceptAgentFinal}=await import('../lib/research/agent-loop.ts');
 const {QWEN_MODEL}=await import('../lib/research/provider-config.ts');
 const binding=VERSION+':'+buildRef;
 // Retain a small receipt tombstone after fixture cleanup. A restarted build
 // with the same grant cannot silently create a new two-request allowance.
 await db.prepare('CREATE TABLE IF NOT EXISTS research_harness_acceptance_runs (run_id TEXT PRIMARY KEY,binding TEXT NOT NULL,state TEXT NOT NULL,model_attempts INTEGER NOT NULL CHECK(model_attempts BETWEEN 0 AND 2),report TEXT,updated TEXT NOT NULL)').run();
 const claim=await db.prepare("INSERT INTO research_harness_acceptance_runs VALUES (?,?,'started',0,NULL,?) ON CONFLICT(run_id) DO NOTHING").bind(runId,binding,new Date().toISOString()).run();
 if(!claim.meta.changes){
  const old=await db.prepare('SELECT binding,state,report FROM research_harness_acceptance_runs WHERE run_id=?').bind(runId).first();
  if(old?.binding!==binding)throw Error('ACCEPTANCE_INPUT_CHANGED');
  if(old.state==='done'&&old.report)return {...JSON.parse(old.report),reused:true,requestAttemptsThisInvocation:0};
  throw Error('ACCEPTANCE_RESULT_UNCERTAIN');
 }
 const id='harness-acceptance-'+runId,thread=id+':r:c',started=Date.now();
 let calls=0,injected=false,cleaned=false;
 const evidence=[{id:'E1',title:'接口验收虚构资料',text:'接口验收虚构资料：团队每次研究都需要重新整理问题、原文与反证。该条仅用于验证模型工具循环，不是用户访谈，不证明需求或付费。',source:'Synthetic engineering fixture',kind:'imported',excluded:false,date:'2026-10-21',fetched:'2026-10-21T00:00:00.000Z',author:'fixture',thread:'fixture',url:'',stance:'context',truncated:false}];
 const task={project_id:id,run_id:'r',revision:1,call_id:'c',role:'needs',allow_tools:true,brief:{title:'接口验收：先检索已有原文，再给出局限明确的分析',audience:'工程验收虚构团队',decision:'只验证工具循环，不判断商业价值'},evidence_ids:['E1'],evidence:[{id:'E1',text:evidence[0].text}],context:{rules:['这是工程验收。第一轮请调用 retrieve_project_evidence，query 为“重新整理问题”，id 为空字符串。取得工具结果后输出有条件分析，明确资料是虚构验收样例。不得调用外部来源。'],memories:[],prior_results:[],simulation:false,attempt:1,scenario:'normal'}};
 const snapshot={task,evidence,since:null,allowFollowUp:true,finalizeAtLimit:true,budget:{modelLimit:2,modelAttempts:1,sourceLimit:0,sourceAttempts:0,searchLimit:0,searches:0,paidBudget:0}};
 const faultDb={prepare(sql){const statement=db.prepare(sql);return {bind(...args){statement.bind(...args);return this},first(){return statement.first()},all(){return statement.all()},async run(){if(!injected&&sql.startsWith('INSERT INTO research_harness_checkpoints')){const known=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id=? AND operation_id='model:0' AND state='done'").bind(thread).first();if(known.n){injected=true;throw Error('ACCEPTANCE_CHECKPOINT_FAILURE')}}return statement.run()}}}};
 const input={...snapshot,threadId:thread,database:faultDb,beforeModel:async()=>{if(calls>=2)throw Error('MODEL_BUDGET')},invoke:async next=>{
  if(calls>=2)throw Error('MODEL_BUDGET');
  const reserved=await db.prepare("UPDATE research_harness_acceptance_runs SET model_attempts=model_attempts+1,updated=? WHERE run_id=? AND binding=? AND state='started' AND model_attempts<2").bind(new Date().toISOString(),runId,binding).run();
  if(!reserved.meta.changes)throw Error('MODEL_BUDGET');calls++;
  return executeAgentTurn(next,adapter,45000);
 }};
 let report={test:VERSION,passed:false,buildRef,model:QWEN_MODEL,paidBudget:0,maxModelCalls:2,sourceRequests:0};
 try{
  await saveStageInput(db,thread,snapshot);
  try{await runResearchHarness(input)}catch(error){if(!injected||error.message!=='ACCEPTANCE_CHECKPOINT_FAILURE')throw error}
  if(!injected)throw Error('FAULT_NOT_INJECTED');
  const known=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id=? AND state='done' AND operation_id='model:0'").bind(thread).first();
  if(known.n!==1)throw Error('MODEL_RECEIPT_NOT_SAVED');
  const result=await runResearchHarness({...input,database:db,resume:true});
  if(!result.final)throw Error('MODEL_FINAL_MISSING');acceptAgentFinal(result.final,result.finalTask);
  if(!result.spend.trace.some(x=>x.name==='retrieve_project_evidence'&&x.status==='executed'))throw Error('MODEL_TOOL_LOOP_NOT_OBSERVED');
  const count=calls;
  await runResearchHarness({...input,database:db,resume:true,invoke:async()=>{throw Error('COMPLETED_MODEL_REPLAYED')}});
  if(calls!==count)throw Error('MODEL_REPLAYED');
  report={...report,passed:true,checkpointRecovery:true,completedReplayCalls:0,confirmedReceipts:result.receipts.length};
 }catch(error){
  const receipt=adapter.receipt||{},requestId=/^[a-zA-Z0-9._:-]{1,200}$/.test(receipt.requestId||'')?receipt.requestId:undefined;
  const fields=(receipt.outputIssues||[]).filter(x=>/^[a-zA-Z0-9_./:[\]-]{1,200}$/.test(x)).slice(0,12);
  report={...report,errorCode:safeCode(error),...(requestId?{requestId}:{}),...(fields.length?{fields}:{}),...(receipt.usage?{usage:receipt.usage}:{})};
 }finally{
  try{await new ResearchCheckpointSaver(db).deleteThread(thread);cleaned=true}catch{report={...report,passed:false,cleanupError:'ACCEPTANCE_CLEANUP_UNCONFIRMED'}}
 }
 report={...report,modelRequestAttempts:calls,requestAttemptsThisInvocation:calls,fixtureCleaned:cleaned,elapsedMs:Date.now()-started};
 const saved=await db.prepare("UPDATE research_harness_acceptance_runs SET state='done',report=?,updated=? WHERE run_id=? AND binding=? AND state='started'").bind(JSON.stringify(report),new Date().toISOString(),runId,binding).run();
 if(!saved.meta.changes)throw Error('ACCEPTANCE_RECEIPT_UNCONFIRMED');
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const flags=new Set(process.argv.slice(2)),value=name=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
 const runId=value('--run-id'),buildRef=value('--ref');
 if(!flags.has('--live')||!flags.has('--max-model-calls=2')||!flags.has('--paid-budget=0')||!uuid.test(runId)||!/^[a-f0-9]{40}$/.test(buildRef)){
  console.error('未执行：需要 --live --max-model-calls=2 --paid-budget=0 --run-id=<UUID> --ref=<commit SHA>；仅在已授权的服务端环境执行。');process.exitCode=2;
 }else if(process.env.VERCEL_GIT_COMMIT_SHA&&process.env.VERCEL_GIT_COMMIT_SHA!==buildRef){
  console.error(JSON.stringify({test:VERSION,passed:false,errorCode:'ACCEPTANCE_BUILD_REF_MISMATCH',modelRequestAttempts:0}));process.exitCode=1;
 }else try{
  const {QwenModel,requireQwenCredentials}=await import('../lib/research/qwen-model.ts');
  const {tursoDatabase}=await import('../lib/deployment/turso-database.ts');
  const key=requireQwenCredentials(process.env.DASHSCOPE_API_KEY,process.env.QWEN_FREE_TIER_ONLY_CONFIRMED==='true',true);
  const report=await verifyHarnessAcceptance({db:tursoDatabase(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN),adapter:new QwenModel(key),runId,buildRef});
  console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
 }catch(error){console.error(JSON.stringify({test:VERSION,passed:false,errorCode:safeCode(error)}));process.exitCode=1;}
}
