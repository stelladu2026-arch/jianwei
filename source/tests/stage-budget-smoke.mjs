import {unknownAlternativeWire} from './alternative-wire-fixture.mjs';
// Actual route handlers, Qwen parser, SDK and SQLite. All HTTP is synthetic.
import assert from 'node:assert/strict';
import {newProject} from '../lib/research/domain.ts';
import {create,get} from '../lib/research/store.ts';
import {makeWorkflow,workflowModelCeiling,workflowRetryBlockReason} from '../lib/research/workflow.ts';
import {reserveStageModel,stageAttempts,modelRetryBlock} from '../lib/research/stage-budget.ts';
import {auditRetryBlockReason,auditModelUsage} from '../lib/research/conclusion-audit.ts';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';
import {makeRun,reserve,failTask} from '../lib/research/execution.ts';
import {runRetryBlockReason,controlRun} from '../lib/research/execution-controls.ts';
const priorFetch=globalThis.fetch,priorKey=globalThis.__testEnv.DASHSCOPE_API_KEY,priorGate=globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED,owned=[];
let passed=0,calls=0,scenario='loop',seen={};
const text='Synthetic original describes repeated configuration work and existing alternatives. This fixture does not prove demand or payment.';
const evidence={id:'E1',title:'Synthetic original',text,source:'Synthetic engineering fixture',date:'2026-10-01',fetched:'2026-10-01',author:'fixture',thread:'fixture',url:'',kind:'imported',stance:'context',excluded:false,truncated:false};
const check=async(label,fn)=>{await fn();passed++;console.log('PASS '+label)};
async function api(p,action,extra={},endpoint='workflow',callId=crypto.randomUUID()){
 const r=await globalThis.__apiTestFetch(`http://test.local/api/projects/${p.id}/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:p.version,callId,action,freeTierOnlyConfirmed:true,...(endpoint==='workflow'?{allowSupplement:true,mode:'single'}:{}),...extra})});
 return {status:r.status,...await r.json()};
}
async function seed(mode='single',supplement=true){
 calls=0;seen={};const p=newProject({title:'Synthetic stage allowance',audience:'Fixture teams',decision:'Offline engineering verification'});p.confirmed=true;p.status='collecting';p.evidence=[structuredClone(evidence)];owned.push(p.id);await create(p);
 const r=await api(p,'start',{mode,allowSupplement:supplement});assert.equal(r.status,200,JSON.stringify(r));return r.project;
}
function wire(body){return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(unknownAlternativeWire(body))}}],usage:{prompt_tokens:10,completion_tokens:4}},{headers:{'x-request-id':'fixture-stage-'+calls}})}
globalThis.fetch=async(url,init)=>{
 if(String(url)===QWEN_BASE_URL+'/chat/completions'){
  calls++;
  if(scenario==='unknown')throw Error('synthetic lost response');
  if(scenario==='unavailable'||scenario==='first-unavailable'&&calls===1)return Response.json({error:{code:'SyntheticServiceUnavailable'}},{status:503});
  const task=JSON.parse(JSON.parse(init.body).messages[1].content),stage=task.purpose||task.role;
  seen[stage]=(seen[stage]||0)+1;
  if(task.purpose==='conclusion_review')return wire({review_format:'conclusion-audit/1',status:'partial',data:{checks:task.review_claims.map(c=>({target:c.target,judgment:'insufficient',reason:'工程样例不证明需求，保留未知。',anchors:[]}))},gaps:['工程虚构样例']});
  if(task.review){
   if(task.role==='verifier'){assert.deepEqual(task.context.memories,[]);assert.deepEqual(task.context.prior_results,[]);}
   const data={notes:[{claim:'工程样例只用于流程检查。',kind:'hypothesis'}],checks:[{target:'note:0',judgment:'partial',reason:'仅工程样例。',anchors:[{evidence_id:'E1',quote:text}]}]};
   if(task.role==='coordinator'){data.proposal={title:'工程验证草稿',problem:'工程样例问题',audience:'虚构团队',alternative:'已有工具',conclusion:'需要真实原文核查，暂不能判断市场机会。',decision:'evidence',payment:'none',counter:'频次可能不足',unknowns:'真实需求未知',plan:'收集真实原文，核对频次与影响。'};data.disagreements=[];for(const target of ['proposal:problem','proposal:conclusion'])data.checks.push({target,judgment:'partial',reason:'仅工程样例。',anchors:[{evidence_id:'E1',quote:text}]});}
   return wire({review_format:'claim-anchors/1',status:'partial',data,gaps:['工程样例']});
  }
  const tools=scenario==='loop'&&task.allow_tools!==false?[{name:'retrieve_project_evidence',arguments:{query:'configuration'}}]:[];
  if(task.purpose)return wire({status:task.purpose==='gap_plan'?'partial':'ok',data:{notes:[{claim:task.purpose==='gap_plan'?'alternatives':'configuration',refs:[],kind:'gap'}],...(task.purpose==='search_plan'?{framing:{target_user:'Fixture teams',scenario:'Repeated work',questions:['What is repeated?']}}:{})},evidence_ids:[],gaps:['工程样例'],tool_calls:tools});
  const refs=task.evidence_ids.slice(0,1);
  return wire({status:'partial',data:{notes:[{claim:'工程虚构样例不证明真实需求。',refs,kind:'hypothesis'}],citations:[],proposal:{title:'工程样例草稿',problem:'Repeated configuration',audience:'Fixture teams',alternative:'Existing tools',conclusion:'工程样例需要真实原文核查。',decision:'evidence',payment:'none',refs,counter:'Frequency unknown',unknowns:'Payment unverified',plan:'Review actual originals'}},evidence_ids:refs,gaps:['工程样例'],tool_calls:tools});
 }
 const address=String(url);
 if(address.startsWith('https://hn.algolia.com'))return Response.json({hits:[{objectID:address.includes('alternatives')?'990002':'990001'}]});
 if(address.startsWith('https://hacker-news.firebaseio.com/')){const id=address.includes('990002')?990002:990001;return Response.json({id,type:'story',by:'fixture-'+id,time:Math.floor(Date.now()/1000)-60,title:'Synthetic source '+id,text:text+' '+id});}
 if(address.startsWith('https://zh.wikipedia.org/'))return Response.json({query:{search:[]}});
 throw Error('Synthetic source not provided');
};
try{
 globalThis.__testEnv.DASHSCOPE_API_KEY='fixture-stage-only-key';globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
 await check('new round limits and independently reserved stages preserve older allowances',()=>{
  const p=newProject();p.confirmed=true;p.evidence=[evidence];assert.equal(makeWorkflow(p,false).budget.modelLimit,4);assert.equal(makeWorkflow(p,true).budget.modelLimit,8);assert.equal(makeWorkflow(p,false,'four').budget.modelLimit,8);
  const w=makeWorkflow(p,true);reserveStageModel(w.budget,'plan');assert.equal(workflowModelCeiling(w),2);reserveStageModel(w.budget,'plan');assert.throws(()=>reserveStageModel(w.budget,'plan'),/MODEL_STAGE_BUDGET/);assert.equal(w.budget.modelAttempts,2);w.stage='analyze';assert.equal(workflowModelCeiling(w),4);reserveStageModel(w.budget,'analyze');assert.equal(stageAttempts(w.budget,'plan'),2);assert.equal(stageAttempts(w.budget,'analyze'),1);
  const old={modelLimit:4,modelAttempts:2};reserveStageModel(old,'plan');assert.deepEqual(old,{modelLimit:4,modelAttempts:3});
  const stopped={...p,workflow:makeWorkflow(p,false,'four')};stopped.workflow.status='failed';stopped.workflow.error='PROVIDER_RATE_LIMIT';stopped.workflow.budget.modelAttempts=8;assert.match(workflowRetryBlockReason(stopped),/预算已用完/);
 });
 await check('standalone execution reserves later roles and never resumes an unknown model request',()=>{
  const p=newProject();p.confirmed=true;p.evidence=[evidence];p.run=makeRun(p,'four','normal',4);p.run.adapter='qwen';p.run.budget.stageLimit=2;
  let reserved=reserve(p,crypto.randomUUID());failTask(p.run,reserved.task,'PROVIDER_UNAVAILABLE',crypto.randomUUID(),1);assert.match(runRetryBlockReason(p.run),/后续阶段保留/);assert.equal(p.run.budget.attempts,1);
  p.run.budget.limit=8;assert.equal(runRetryBlockReason(p.run),'');controlRun(p,'retry');reserved=reserve(p,crypto.randomUUID());controlRun(p,'pause');controlRun(p,'resume');assert.equal(p.run.status,'failed');assert.equal(p.run.budget.attempts,2);assert.equal(p.run.tasks[0].output,undefined);assert.ok(runRetryBlockReason(p.run));
 });
 await check('all four optional single-role stages finish with two calls each and save one draft',async()=>{
  scenario='loop';let p=await seed();for(let i=0;i<14&&p.workflow.status==='ready';i++){const r=await api(p,'advance');assert.equal(r.status,200,JSON.stringify(r));p=r.project;}
  assert.equal(p.workflow.status,'completed',JSON.stringify({stage:p.workflow.stage,error:p.workflow.error,fields:p.workflow.records.at(-1)?.outputIssues}));assert.equal(calls,8);assert.deepEqual(p.workflow.budget.stageAttempts,{plan:2,analyze:2,gap:2,reanalyze:2});assert.equal(p.workflow.budget.modelAttempts,8);assert.equal(p.opportunities.length,1);assert.equal(p.workflow.records.filter(r=>r.kind==='model').every(r=>r.agentModelReceipts.length===2),true);
 });
 await check('without supplement planning cannot borrow the two analysis slots',async()=>{
  scenario='loop';let p=await seed('single',false);for(let i=0;i<10&&p.workflow.status==='ready';i++)p=(await api(p,'advance')).project;
  assert.equal(p.workflow.status,'completed');assert.equal(calls,4);assert.deepEqual(p.workflow.budget.stageAttempts,{plan:2,analyze:2});
 });
 await check('concurrent and replayed stage advances cannot reserve another stage slot',async()=>{
  scenario='normal';const p=await seed('single',false),ids=[crypto.randomUUID(),crypto.randomUUID()];
  const results=await Promise.all(ids.map(id=>api(p,'advance',{},'workflow',id)));const callId=ids[results.findIndex(r=>r.status===200)];assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(calls,1);
  const saved=await get(p.id);assert.equal(saved.workflow.budget.modelAttempts,1);assert.equal(saved.workflow.budget.stageAttempts.plan,1);assert.equal((await api(p,'advance',{},'workflow',callId)).status,200);assert.equal(calls,1);assert.equal((await get(p.id)).workflow.budget.stageAttempts.plan,1);
 });
 await check('known provider failure allows only explicit preparation and keeps both failed attempts',async()=>{
  scenario='unavailable';let p=await seed('single',false);p=(await api(p,'advance')).project;assert.equal(calls,1);assert.equal(workflowRetryBlockReason(p),'');const before=structuredClone(p);p=(await api(p,'retry')).project;assert.equal(calls,1);assert.equal(p.workflow.budget.modelAttempts,1);assert.deepEqual(p.workflow.records,before.workflow.records);p=(await api(p,'advance')).project;assert.equal(calls,2);assert.equal(p.workflow.budget.modelAttempts,2);assert.match(workflowRetryBlockReason(p),/2 \/ 2/);assert.equal((await api(p,'retry')).status,400);assert.equal(calls,2);assert.equal(p.workflow.budget.modelLimit,4);
 });
 await check('unknown responses never replay just because one stage slot remains',async()=>{
  scenario='unknown';let p=await seed();p=(await api(p,'advance')).project;assert.equal(calls,1);assert.equal(p.workflow.budget.stageAttempts.plan,1);assert.equal((await api(p,'retry')).status,400);assert.equal(calls,1);for(const code of ['MODEL_TIMEOUT','PROVIDER_NETWORK_ERROR','EXECUTION_INTERRUPTED','INVALID_MODEL_REFERENCE','INVALID_EVIDENCE_QUOTE','INVALID_MODEL_OUTPUT'])assert.ok(modelRetryBlock(code));
 });
 await check('four-role retry stays in its own stage and does not rerun completed predecessors',async()=>{
  scenario='first-unavailable';let p=await seed('four',false);p=(await api(p,'advance')).project;assert.equal(p.workflow.stage,'needs');assert.equal(p.workflow.status,'failed');assert.equal(calls,1);p=(await api(p,'retry')).project;assert.equal(calls,1);scenario='normal';for(let i=0;i<7&&p.workflow.status==='ready';i++)p=(await api(p,'advance')).project;
  assert.equal(p.workflow.status,'completed',JSON.stringify({stage:p.workflow.stage,error:p.workflow.error}));assert.equal(calls,5);assert.deepEqual(p.workflow.budget.stageAttempts,{needs:2,commercial:1,verifier:1,synthesis:1});assert.equal(p.workflow.analysisRun.tasks.find(t=>t.id==='needs').calls.length,2);
  p=(await api(p,'start',{},'conclusion-review')).project;assert.equal(p.workflow.conclusionAudit.budget.modelLimit,2);scenario='first-unavailable';const before=calls;scenario='unavailable';p=(await api(p,'advance',{},'conclusion-review')).project;assert.equal(calls,before+1);assert.equal(auditRetryBlockReason(p),'');p=(await api(p,'retry',{},'conclusion-review')).project;assert.equal(calls,before+1);scenario='normal';p=(await api(p,'advance',{},'conclusion-review')).project;
  assert.equal(p.workflow.conclusionAudit.status,'completed');assert.equal(calls,before+2);assert.equal(p.workflow.conclusionAudit.calls.length,2);assert.equal(auditModelUsage(p.workflow.conclusionAudit).unknown,1);assert.equal(p.workflow.budget.modelAttempts,5);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,2);assert.equal((await api(p,'retry',{},'conclusion-review')).status,400);
 });
 console.log(`Stage request allocation: ${passed} checks passed; real model calls: 0; real source calls: 0.`);
}finally{globalThis.fetch=priorFetch;globalThis.__testEnv.DASHSCOPE_API_KEY=priorKey;globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED=priorGate;for(const id of owned){const p=await get(id);if(p)await globalThis.__apiTestFetch(`http://test.local/api/projects/${id}?version=${p.version}`,{method:'DELETE'})}}
