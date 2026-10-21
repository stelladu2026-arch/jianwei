// Opt-in only. Run in an authorized server environment; never copy or print
// production secrets. Creates an isolated synthetic thread, not a user project.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true}}return next(specifier,context)}});
const flags=new Set(process.argv.slice(2));
if(!flags.has('--live')||!flags.has('--max-model-calls=2')||!flags.has('--paid-budget=0')){
 console.error('未执行：需要 --live --max-model-calls=2 --paid-budget=0；仅在已授权的服务端环境执行。');process.exit(2);
}
const {createHarnessTursoDatabase}=await import('../lib/research/harness/turso-http.ts');
const {runResearchHarness}=await import('../lib/research/harness/runner.ts');
const {ResearchCheckpointSaver}=await import('../lib/research/harness/checkpointer.ts');
const {saveStageInput}=await import('../lib/research/harness/recovery.ts');
const {QwenModel,requireQwenCredentials}=await import('../lib/research/qwen-model.ts');
const {executeModel}=await import('../lib/research/execution.ts');
const {AgentToolCalls,acceptAgentFinal}=await import('../lib/research/agent-loop.ts');
const {QWEN_MODEL}=await import('../lib/research/provider-config.ts');
const key=requireQwenCredentials(process.env.DASHSCOPE_API_KEY,process.env.QWEN_FREE_TIER_ONLY_CONFIRMED==='true',true);
const db=createHarnessTursoDatabase({url:process.env.TURSO_DATABASE_URL||'',token:process.env.TURSO_AUTH_TOKEN||''});
const adapter=new QwenModel(key),id='harness-acceptance-'+crypto.randomUUID(),thread=id+':r:c';
let calls=0,injected=false,cleaned=false;const started=Date.now();
const evidence=[{id:'E1',title:'接口验收虚构资料',text:'接口验收虚构资料：团队每次研究都需要重新整理问题、原文与反证。该条仅用于验证模型工具循环，不是用户访谈，不证明需求或付费。',source:'Synthetic engineering fixture',kind:'imported',excluded:false,date:'2026-10-21',fetched:new Date().toISOString(),author:'fixture',thread:'fixture',url:'',stance:'context',truncated:false}];
const task={project_id:id,run_id:'r',revision:1,call_id:'c',role:'needs',allow_tools:true,brief:{title:'接口验收：先检索已有原文，再给出局限明确的分析',audience:'工程验收虚构团队',decision:'只验证工具循环，不判断商业价值'},evidence_ids:['E1'],evidence:[{id:'E1',text:evidence[0].text}],context:{rules:['这是工程验收。第一轮请调用 retrieve_project_evidence，query 为“重新整理问题”，id 为空字符串。取得工具结果后输出有条件分析，明确资料是虚构验收样例。不得调用外部来源。'],memories:[],prior_results:[],simulation:false,attempt:1,scenario:'normal'}};
const snapshot={task,evidence,since:null,allowFollowUp:true,finalizeAtLimit:true,budget:{modelLimit:2,modelAttempts:1,sourceLimit:0,sourceAttempts:0,searchLimit:0,searches:0,paidBudget:0}};
const faultDb={prepare(sql){const statement=db.prepare(sql);return {bind(...args){statement.bind(...args);return this},first(){return statement.first()},all(){return statement.all()},async run(){if(!injected&&sql.startsWith('INSERT INTO research_harness_checkpoints')){const known=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id=? AND operation_id='model:0' AND state='done'").bind(thread).first();if(known.n){injected=true;throw Error('ACCEPTANCE_CHECKPOINT_FAILURE')}}return statement.run()}}}};
const input={...snapshot,threadId:thread,database:faultDb,beforeModel:async()=>{if(calls>=2)throw Error('MODEL_BUDGET')},invoke:async next=>{if(calls>=2)throw Error('MODEL_BUDGET');calls++;try{return {final:await executeModel(next,adapter,45000),toolCalls:[],receipt:{...adapter.receipt}}}catch(error){if(error instanceof AgentToolCalls)return {final:null,toolCalls:error.calls,receipt:{...adapter.receipt}};throw error}}};
let report={test:'harness-qwen-turso',passed:false,model:QWEN_MODEL,paidBudget:0,maxModelCalls:2,sourceRequests:0};
try{
 await saveStageInput(db,thread,snapshot);
 try{await runResearchHarness(input)}catch(error){if(!injected||error.message!=='ACCEPTANCE_CHECKPOINT_FAILURE')throw error}
 if(!injected)throw Error('FAULT_NOT_INJECTED');
 const knownBefore=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id=? AND state='done' AND operation_id='model:0'").bind(thread).first();
 if(knownBefore.n!==1)throw Error('MODEL_RECEIPT_NOT_SAVED');
 const result=await runResearchHarness({...input,database:db,resume:true});
 if(!result.final)throw Error('MODEL_FINAL_MISSING');acceptAgentFinal(result.final,result.finalTask);
 if(!result.spend.trace.some(x=>x.name==='retrieve_project_evidence'&&x.status==='executed'))throw Error('MODEL_TOOL_LOOP_NOT_OBSERVED');
 const count=calls;
 await runResearchHarness({...input,database:db,resume:true,invoke:async()=>{throw Error('COMPLETED_MODEL_REPLAYED')}});
 if(calls!==count)throw Error('MODEL_REPLAYED');
 report={...report,passed:true,checkpointRecovery:true,completedReplayCalls:0,confirmedReceipts:result.receipts.length};
}catch{process.exitCode=1;report={...report,error:'验收未通过；请在服务端按安全请求编号核查，不自动重试。'};
}finally{
 try{await new ResearchCheckpointSaver(db).deleteThread(thread);cleaned=true}catch{process.exitCode=1}
 console.log(JSON.stringify({...report,actualModelCalls:calls,fixtureCleaned:cleaned,elapsedMs:Date.now()-started}));
}
