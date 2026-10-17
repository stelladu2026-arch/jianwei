import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newProject} from '../lib/research/domain.ts';
import {create,get,save} from '../lib/research/store.ts';
import {makeWorkflow} from '../lib/research/workflow.ts';
import {initializeFour,claims} from '../lib/research/collaboration.ts';
import {auditTask,locateAudit,AUDIT_FORMAT} from '../lib/research/conclusion-audit.ts';
import {auditResponseSchema,quoteChoices} from '../lib/research/qwen-model.ts';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';
const require=createRequire(import.meta.url),Ajv=createRequire(require.resolve('eslint'))('ajv'),ajv=new Ajv({allErrors:true});
const priorFetch=globalThis.fetch,key='sk-synthetic-audit-only',owned=[];
let passed=0,calls=0,scenario='normal',release,startedResolve,template,lastTask,lastSchema;
async function check(label,fn){await fn();passed++;console.log('PASS '+label)}
async function api(path,method='GET',body){const r=await globalThis.__apiTestFetch('http://test.local'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
function action(p,action,extra={},callId=crypto.randomUUID()){return api(`/api/projects/${p.id}/conclusion-review`,'POST',{version:p.version,callId,action,freeTierOnlyConfirmed:true,...extra})}
async function patch(p,action,data){const r=await api(`/api/projects/${p.id}`,'PATCH',{version:p.version,callId:crypto.randomUUID(),action,data});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.project}
async function fixture(){const p=structuredClone(template);p.id=crypto.randomUUID();p.version=1;p.actions=[];p.workflow.id=crypto.randomUUID();p.workflow.analysisRun.id=crypto.randomUUID();delete p.workflow.conclusionAudit;owned.push(p.id);return create(p)}
async function startPending(p){const started=new Promise(resolve=>{startedResolve=resolve}),pending=action(p,'advance');await Promise.race([started,pending.then(r=>{throw new Error('pending request did not reach fake HTTP: '+JSON.stringify(r))})]);startedResolve=undefined;assert.ok(release);return {pending};}
async function ready(){const p=await fixture(),r=await action(p,'start');assert.equal(r.status,200,JSON.stringify(r.data));return r.data.project}
function auditWire(task){return {review_format:AUDIT_FORMAT,status:'partial',data:{checks:task.review_claims.map((t,i)=>({target:t.target,judgment:i%3===0?'insufficient':i%3===1?'partial':'contradicts',reason:'Synthetic fixture judgment; not semantic quality.',anchors:i%3===0?[]:[{evidence_id:i%3===1?t.refs[0]:task.evidence_ids[1],quote:quoteChoices([task.evidence.find(e=>e.id===(i%3===1?t.refs[0]:task.evidence_ids[1]))])[0]}]}))},gaps:['Synthetic public comments do not establish actual payment.']}}
globalThis.fetch=async(url,init)=>{
 assert.equal(url,QWEN_BASE_URL+'/chat/completions');assert.equal(init.redirect,'manual');calls++;
 const body=JSON.parse(init.body),task=JSON.parse(body.messages[1].content),schema=body.response_format.json_schema.schema;
 if(task.purpose==='conclusion_review'){
  lastTask=task;lastSchema=schema;assert.ok(!body.messages[0].content.includes('tool_calls'));assert.deepEqual(task.context.memories,[]);assert.equal(task.context.prior_results.length,4);
  if(scenario==='pending')await new Promise(resolve=>{release=resolve;startedResolve?.();});
  if(scenario==='quota')return Response.json({error:{code:'AllocationQuota.FreeTierOnly',message:key}},{status:403});
  if(scenario==='auth')return Response.json({error:{message:key}},{status:401});
  const wire=auditWire(task),checks=wire.data.checks;
  if(scenario==='missing')checks.pop();
  if(scenario==='duplicate')checks[0]=structuredClone(checks[1]);
  if(scenario==='unknown')checks[0].target='unknown:target';
  if(scenario==='anchorless')checks[1].anchors=[];
  if(scenario==='foreign')checks[1].anchors[0].evidence_id='FOREIGN';
  if(scenario==='quote')checks[1].anchors[0].quote='Invented confidential-looking fixture not in input.';
  if(scenario==='crossquote')checks[1].anchors[0].quote=quoteChoices([task.evidence[1]])[0];
  if(scenario==='other_support'){checks[1].anchors=[{evidence_id:task.evidence_ids[1],quote:quoteChoices([task.evidence[1]])[0]}];}
  if(scenario==='tool')wire.tool_calls=[];
  return Response.json({usage:{prompt_tokens:300,completion_tokens:200},choices:[{finish_reason:scenario==='truncated'?'length':'stop',message:{content:JSON.stringify(wire)}}]},{headers:{'x-request-id':'fixture-audit'}});
 }
 if(task.role==='verifier'){assert.deepEqual(task.context.prior_results,[]);assert.deepEqual(task.context.memories,[])}
 const data={notes:[{claim:'Synthetic conditional pain point.',kind:'hypothesis'},{claim:'Synthetic low volume counterexample.',kind:'counter'}],checks:[0,1].map(i=>({target:'note:'+i,judgment:'partial',reason:'Synthetic only.',anchors:[{evidence_id:task.evidence_ids[0],quote:quoteChoices([task.evidence[0]])[0]}]}))};
 if(task.role==='coordinator'){
  data.proposal={title:'Synthetic opportunity',problem:'Synthetic problem',audience:'Synthetic teams',alternative:'Existing tools',conclusion:'Synthetic conditional conclusion',decision:'evidence',payment:'none',counter:'Low frequency',unknowns:'Payment unverified',plan:'Interview; no actual payments claimed'};data.disagreements=[];
  for(const target of ['proposal:problem','proposal:conclusion'])data.checks.push({target,judgment:'partial',reason:'Synthetic only.',anchors:[{evidence_id:task.evidence_ids[0],quote:quoteChoices([task.evidence[0]])[0]}]});
 }
 return Response.json({usage:{prompt_tokens:100,completion_tokens:80},choices:[{finish_reason:'stop',message:{content:JSON.stringify({review_format:'claim-anchors/1',status:'partial',data,gaps:[]})}}]});
};
try{
 globalThis.__testEnv.DASHSCOPE_API_KEY=key;globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
 let seed=newProject({title:'Synthetic conclusion audit fixture',audience:'Synthetic teams',decision:'Test route contracts only'});seed.confirmed=true;seed.status='collecting';seed.evidence=[1,2].map(i=>({id:'E'+i,title:'Synthetic source '+i,text:'Synthetic source '+i+' describes repeated setup questions and different constraints. Public interest does not establish actual payment.',source:'Synthetic fixture only',date:'2026-10-01',fetched:'2026-10-01',author:'fixture'+i,thread:'t'+i,url:'',kind:'imported',stance:'context',excluded:false,truncated:false}));seed.workflow=makeWorkflow(seed,false,'four');await initializeFour(seed,seed.workflow);seed=await create(seed);owned.push(seed.id);
 for(let i=0;i<6;i++){const r=await api(`/api/projects/${seed.id}/workflow`,'POST',{version:seed.version,callId:crypto.randomUUID(),action:'advance',mode:'four',freeTierOnlyConfirmed:true});assert.equal(r.status,200,JSON.stringify(r.data));seed=r.data.project;}
 template=seed;
 await check('original four-role loop stays blind on first verifier and capped at four calls',()=>{assert.equal(calls,4);assert.equal(seed.workflow.status,'completed');assert.equal(seed.workflow.budget.modelAttempts,4);assert.equal(seed.workflow.analysisRun.budget.limit,4)});
 let p=await fixture(),n=calls,r=await action(p,'start',{freeTierOnlyConfirmed:false});
 await check('second pass requires explicit separate confirmation before creating checkpoint',async()=>{assert.equal(r.status,400);assert.equal(calls,n);assert.equal((await get(p.id)).workflow.conclusionAudit,undefined)});
 const startId=crypto.randomUUID();r=await action(p,'start',{},startId);p=r.data.project;
 await check('creation freezes all ten claims for preview without generation',()=>{assert.equal(r.status,200);assert.equal(calls,n);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,0);assert.equal(p.workflow.conclusionAudit.input.review_claims.length,10);assert.equal(p.workflow.conclusionAudit.input.review_claims.at(-1).target,'coordinator:proposal:conclusion')});
 r=await action({...p,version:1},'start',{},startId);
 await check('duplicate creation is idempotent with stale client version',()=>{assert.equal(r.status,200);assert.equal(r.data.project.workflow.conclusionAudit.id,p.workflow.conclusionAudit.id)});
 delete globalThis.__testEnv.DASHSCOPE_API_KEY;r=await action(p,'advance');
 await check('missing secret blocks before spending audit budget',()=>{assert.equal(r.status,400);assert.equal(calls,n)});globalThis.__testEnv.DASHSCOPE_API_KEY=key;
 for(const endpoint of ['run','workflow']){r=await api(`/api/projects/${p.id}/${endpoint}`,'POST',{version:p.version,callId:crypto.randomUUID(),action:'start',adapter:undefined,mode:'four',freeTierOnlyConfirmed:true});await check('active audit blocks competing '+endpoint+' start',()=>{assert.equal(r.status,400);assert.equal(calls,n)})}
 const before=structuredClone(p),advanceId=crypto.randomUUID();r=await action(p,'advance',{},advanceId);p=r.data.project;
 await check('second verifier reads predecessors and completes one separate request',()=>{assert.equal(r.status,200);assert.equal(calls,n+1);assert.equal(p.workflow.conclusionAudit.status,'completed');assert.equal(p.workflow.conclusionAudit.checks.length,10);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,1);assert.equal(p.workflow.budget.modelAttempts,4);assert.equal(p.budget.modelCalls,5);assert.equal(lastTask.context.prior_results.length,4);assert.ok(lastTask.review_claims.some(c=>c.target==='needs:note:0'))});
 await check('audit preserves prior outputs, human review, report, opportunity drafts and memory',()=>{assert.deepEqual(p.workflow.analysisRun,before.workflow.analysisRun);assert.equal(p.workflow.report,before.workflow.report);assert.deepEqual(p.opportunities,before.opportunities);assert.deepEqual(p.memories,before.memories);assert.deepEqual(p.workflow.comparison,before.workflow.comparison);assert.ok(!JSON.stringify(p).includes(key))});
 await check('provider schema constrains count and sources while runtime enforces unique target coverage',()=>{
  const validate=ajv.compile(lastSchema),wire=auditWire(lastTask);assert.equal(validate(wire),true,JSON.stringify(validate.errors));const repeated=structuredClone(wire);repeated.data.checks[0]=structuredClone(repeated.data.checks[1]);assert.equal(validate(repeated),true);assert.throws(()=>locateAudit(repeated,lastTask),/INVALID_REVIEW_COVERAGE/);
  for(const edit of [w=>w.data.checks.pop(),w=>w.data.checks[1].anchors=[],w=>w.data.checks[1].anchors[0].quote=quoteChoices([lastTask.evidence[1]])[0],w=>w.data.checks[1].anchors[0]={evidence_id:'E2',quote:quoteChoices([lastTask.evidence[1]])[0]}]){const bad=structuredClone(wire);edit(bad);assert.equal(validate(bad),false)}
 });
 r=await action(before,'advance',{},advanceId);await check('replayed completed advance does not call again',()=>{assert.equal(r.status,200);assert.equal(calls,n+1)});
 for(const actionName of ['start','advance']){r=await action(p,actionName);await check('completed audit cannot reset via '+actionName,()=>{assert.equal(r.status,400);assert.equal(calls,n+1)})}
 for(const [fault,code] of [['missing','INVALID_REVIEW_COVERAGE'],['duplicate','INVALID_REVIEW_COVERAGE'],['unknown','INVALID_REVIEW_COVERAGE'],['anchorless','INVALID_REVIEW_COVERAGE'],['foreign','INVALID_MODEL_REFERENCE'],['quote','INVALID_EVIDENCE_QUOTE'],['crossquote','INVALID_EVIDENCE_QUOTE'],['other_support','INVALID_MODEL_REFERENCE'],['tool','INVALID_MODEL_OUTPUT'],['truncated','MODEL_OUTPUT_TRUNCATED'],['quota','FREE_QUOTA_EXHAUSTED'],['auth','PROVIDER_AUTH_ERROR']]){
  scenario=fault;p=await ready();n=calls;r=await action(p,'advance');p=r.data.project;
  await check('audit '+fault+' fails once, preserves receipt, rejects output and cannot retry',async()=>{assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(p.workflow.conclusionAudit.status,'failed');assert.equal(p.workflow.conclusionAudit.error,code);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,1);assert.equal(p.workflow.conclusionAudit.checks,undefined);assert.equal(p.workflow.conclusionAudit.usage!==undefined,!['quota','auth'].includes(fault));assert.equal((await action(p,'advance')).status,400);assert.equal((await action(p,'start')).status,400);assert.equal(calls,n+1);assert.ok(!JSON.stringify(p).includes('Invented confidential'));assert.ok(!JSON.stringify(p).includes(key));});
 }
 scenario='normal';p=await ready();n=calls;const changed=await patch(p,'removeEvidence','E1');r=await action(changed,'advance');
 await check('evidence editing marks audit stale and prevents any HTTP',()=>{assert.equal(changed.workflow.conclusionAudit.status,'stale');assert.equal(r.status,400);assert.equal(calls,n)});
 p=await ready();p.workflow.analysisRun.tasks[0].output.data.notes[0].claim='Changed internal conclusion';p=await save(p,p.version);r=await action(p,'advance');
 await check('source hash catches changed predecessor even without version invalidation',()=>{assert.equal(r.status,400);assert.equal(calls,n)});
 p=await ready();p.workflow.frozen.evidence[0].text='x'.repeat(25000);p.evidence[0].text=p.workflow.frozen.evidence[0].text;delete p.workflow.conclusionAudit;p=await save(p,p.version);r=await action(p,'start');
 await check('oversized complete claim input fails before spending or silently truncating',()=>{assert.equal(r.status,400);assert.equal(calls,n);assert.equal((r.data.error).includes('上下文'),true)});
 for(const edit of ['cancel','pause','archive','removeEvidence']){
  scenario='pending';release=undefined;p=await ready();n=calls;const {pending}=await startPending(p);let during=await get(p.id);
  if(edit==='cancel')during=(await action(during,'cancel')).data.project;else during=await patch(during,edit,edit==='removeEvidence'?'E1':undefined);
  release();r=await pending;p=await get(p.id);
  await check('concurrent '+edit+' wins and rejects late audit output',()=>{assert.equal(r.status,409);assert.equal(p.workflow.conclusionAudit.checks,undefined);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,1);assert.equal(p.workflow.conclusionAudit.usage,undefined);assert.equal(calls,n+1)});
 }
 scenario='pending';release=undefined;p=await ready();const {pending}=await startPending(p);p=await get(p.id);r=await action(p,'recover');
 await check('unexpired audit cannot be recovered and keeps request count',()=>{assert.equal(r.status,400);assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,1)});
 p.workflow.conclusionAudit.lease.expires=new Date(0).toISOString();p=await save(p,p.version);r=await action(p,'recover');p=r.data.project;release();const late=await pending;
 await check('expired recovery preserves unknown use and cannot replay request',async()=>{assert.equal(r.status,200);assert.equal(p.workflow.conclusionAudit.status,'failed');assert.equal(p.workflow.conclusionAudit.error,'EXECUTION_INTERRUPTED');assert.equal(p.workflow.conclusionAudit.budget.modelAttempts,1);assert.equal(p.workflow.conclusionAudit.usage,undefined);assert.equal(late.status,409);assert.equal((await action(p,'advance')).status,400)});
 scenario='normal';p=await ready();p=(await action(p,'advance')).data.project;const audit=structuredClone(p.workflow.conclusionAudit),spent=p.budget.modelCalls;
 r=await api(`/api/projects/${p.id}/workflow`,'POST',{version:p.version,callId:crypto.randomUUID(),action:'start',mode:'four',freeTierOnlyConfirmed:true});p=r.data.project;
 await check('explicit fresh workflow archives prior audit and preserves cumulative spend',()=>{assert.equal(r.status,200);assert.deepEqual(p.workflowHistory[0].conclusionAudit,audit);assert.equal(p.budget.modelCalls,spent);assert.equal(p.workflow.budget.modelAttempts,0);assert.equal(p.workflow.conclusionAudit,undefined)});
 await check('single, simulation, incomplete, outdated and cross-site audits cannot start',async()=>{
  for(const edit of [q=>q.workflow.mode='single',q=>q.workflow.analysisRun.simulation=true,q=>q.workflow.status='failed',q=>q.workflow.revision=2,q=>q.confirmed=false]){const q=await fixture();edit(q);await save(q,q.version);assert.equal((await action(await get(q.id),'start')).status,400)}
  const q=await fixture(),res=await globalThis.__apiTestFetch(`http://test.local/api/projects/${q.id}/conclusion-review`,{method:'POST',headers:{'sec-fetch-site':'cross-site'},body:JSON.stringify({version:q.version,callId:crypto.randomUUID(),action:'start',freeTierOnlyConfirmed:true})});assert.equal(res.status,403);
 });
 console.log(JSON.stringify({conclusion_audit_checks:passed,actual_model_calls:0,scope:'real routes and SQLite; synthetic HTTP, no live Qwen or semantic quality measurement'}));
}finally{globalThis.fetch=priorFetch;delete globalThis.__testEnv.DASHSCOPE_API_KEY;delete globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED;for(const id of owned){const p=await get(id);if(p)await api(`/api/projects/${id}?version=${p.version}`,'DELETE')}}
