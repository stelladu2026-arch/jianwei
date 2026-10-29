import {unknownAlternativeWire} from './alternative-wire-fixture.mjs';
// Route + SQL + actual DeepAgents execution; all provider HTTP is synthetic.
import assert from 'node:assert/strict';
import {fixtureProject} from '../lib/research/evaluation.ts';
import {create,get,save} from '../lib/research/store.ts';
import {stageRecovery} from '../lib/research/harness/recovery.ts';
const originalDb=globalThis.__testEnv.DB,originalFetch=globalThis.fetch,originalKey=globalThis.__testEnv.DASHSCOPE_API_KEY,originalGate=globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED;
const owned=[];let passed=0,calls=0,inject=false,uncertain=false,faultProjectId='';
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
async function api(p,action,callId=crypto.randomUUID(),options={}){const response=await globalThis.__apiTestFetch(`http://test.local/api/projects/${p.id}/workflow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:p.version,action,callId,allowSupplement:false,freeTierOnlyConfirmed:true,...options})});return {status:response.status,...await response.json()}}
async function project(){const p=fixtureProject('baseline');p.id=crypto.randomUUID();p.mode='manual';p.evidence=p.evidence.map(e=>({...e,kind:'imported'}));owned.push(p.id);return create(p)}
function faultDb(){return {prepare(sql){const statement=originalDb.prepare(sql);return {bind(...args){statement.bind(...args);return this},first(){return statement.first()},all(){return statement.all()},async run(){if(inject&&sql.startsWith('INSERT INTO research_harness_checkpoints')){const known=await originalDb.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE state='done' AND operation_id='model:0' AND thread_id LIKE ?").bind(faultProjectId+':%').first();if(known.n){inject=false;throw Error('SYNTHETIC_CHECKPOINT_FAILURE')}}return statement.run()}}}}}
globalThis.__testEnv.DASHSCOPE_API_KEY='sk-synthetic-harness-recovery-only';globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
globalThis.fetch=async(url,init)=>{
 if(!String(url).endsWith('/chat/completions'))return originalFetch(url,init);
 calls++;if(uncertain)throw Error('SYNTHETIC_LOST_RESPONSE');
 const task=JSON.parse(JSON.parse(init.body).messages[1].content),refs=task.evidence_ids.slice(0,1);
 const content=task.purpose?{status:'ok',data:{notes:[{claim:'fixture research',refs:[],kind:'gap'}],framing:{target_user:'Fixture teams',scenario:'Synthetic repeated setup',questions:['What is repeated?']}},evidence_ids:[],gaps:[]}:{status:'partial',data:{notes:[{claim:'Synthetic conditional result',refs,kind:'hypothesis'}],proposal:{title:'Synthetic recovery opportunity',problem:'Unverified friction',audience:'Fixture teams',alternative:'Existing tools',conclusion:'Conditional fixture only',decision:'evidence',payment:'none',refs,counter:'Synthetic counterexample',unknowns:'Payment unknown',plan:'Review originals',demand:{who:'Fixture teams',problem:'Repeated questions',effect:'Unverified effort',workaround:'Existing templates'}}},evidence_ids:refs,gaps:['Synthetic fixture, no market claim']};
 return Response.json({usage:{prompt_tokens:23,completion_tokens:7},choices:[{finish_reason:'stop',message:{content:JSON.stringify(unknownAlternativeWire(content))}}]},{headers:{'x-request-id':'synthetic-recovery-receipt'}});
};
try{
 let p=(await api(await project(),'start')).project;
 globalThis.__testEnv.DB=faultDb();faultProjectId=p.id;inject=true;
 let r=await api(p,'advance');assert.equal(r.status,200);p=r.project;
 await check('checkpoint failure preserves a known result and exposes a recovery entry',async()=>{
  assert.equal(p.workflow.status,'failed');assert.equal(calls,1);assert.equal(p.workflow.budget.modelAttempts,1);
  const permission=await stageRecovery(originalDb,p);assert.equal(permission.allowed,true,permission.reason);
  const response=await globalThis.__apiTestFetch(`http://test.local/api/projects/${p.id}/harness`);const status=await response.json();assert.equal(status.recovery.allowed,true);assert.equal(JSON.stringify(status).includes(p.evidence[0].text),false);
 });
 await check('model or quality-policy drift refuses recovery without consuming budget',async()=>{
  const thread=p.workflow.records.at(-1).harnessThreadId;
  const row=await originalDb.prepare('SELECT input FROM research_harness_stage_inputs WHERE thread_id=?').bind(thread).first();
  const snapshot=JSON.parse(row.input),n=calls;
  for(const change of [{model:'old-model'},{qualityPolicy:'old-policy'},{model:undefined,qualityPolicy:undefined},{sourcePolicy:'old-source-policy'}]){
   await originalDb.prepare('UPDATE research_harness_stage_inputs SET input=? WHERE thread_id=?').bind(JSON.stringify({...snapshot,...change}),thread).run();
   const permission=await stageRecovery(originalDb,p);assert.equal(permission.allowed,false);assert.ok(permission.reason.includes('协议'));assert.equal(calls,n);
  }
  await originalDb.prepare('UPDATE research_harness_stage_inputs SET input=? WHERE thread_id=?').bind(row.input,thread).run();
  assert.equal((await stageRecovery(originalDb,p)).allowed,true);
 });
 globalThis.__testEnv.DB=originalDb;
 const before=p,recoveryId=crypto.randomUUID();r=await api(p,'recover-stage',recoveryId);p=r.project;
 await check('route recovery reuses the provider receipt without another reservation or HTTP call',async()=>{
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(p.workflow.status,'ready');assert.equal(p.workflow.stage,'collect');assert.equal(calls,1);assert.equal(p.workflow.budget.modelAttempts,1);assert.equal(p.workflow.records.length,1);assert.equal(p.workflow.records[0].recoveries.length,1);assert.equal(p.workflow.records[0].usage.input_tokens,23);assert.equal(p.workflow.records[0].requestId,'synthetic-recovery-receipt');
  const again=await api(before,'recover-stage',recoveryId);assert.equal(again.status,200);assert.equal(calls,1);assert.equal(again.project.version,p.version);
 });
 await check('background HTTP accepts work without executing it inside the response',async()=>{
  const response=await globalThis.__apiTestFetch(`http://test.local/api/projects/${p.id}/workflow/background`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',version:p.version,callId:crypto.randomUUID(),freeTierOnlyConfirmed:true})});
  assert.equal(response.status,202);const body=await response.json();p=body.project;assert.ok(p.version>before.version);assert.equal(calls,1);assert.equal(globalThis.__afterTestTasks.length,1);assert.ok(!JSON.stringify(body).includes('token_hash'));
 });
 await check('post-response execution completes collection analysis checks and opportunity draft',async()=>{
  await globalThis.__afterTestTasks.shift()();p=await get(p.id);assert.equal(p.workflow.status,'completed',JSON.stringify({stage:p.workflow.stage,error:p.workflow.error}));assert.equal(calls,2);assert.equal(p.workflow.budget.modelAttempts,2);assert.ok(p.opportunities.some(o=>o.status==='draft'));const response=await globalThis.__apiTestFetch(`http://test.local/api/projects/${p.id}/harness`);const state=await response.json();assert.equal(state.background.state,'completed');assert.equal(state.active,false);
 });
 uncertain=true;p=(await api(await project(),'start')).project;p=(await api(p,'advance')).project;
 await check('lost provider responses have no stage recovery or automatic replay',async()=>{const n=calls;const permission=await stageRecovery(originalDb,p);assert.equal(permission.allowed,false);const r=await api(p,'recover-stage');assert.equal(r.status,400);assert.equal(calls,n);assert.equal(p.workflow.budget.modelAttempts,1)});
 uncertain=false;
 await check('workflow route executes attached Qwen JSON tools and records both bounded model receipts',async()=>{
  const previousFetch=globalThis.fetch;let requests=0;
  try{
   globalThis.fetch=async(url,init)=>{
    if(!String(url).endsWith('/chat/completions'))return previousFetch(url,init);
    requests++;
    const next=JSON.parse(JSON.parse(init.body).messages[1].content);
    if(requests===2)assert.match(JSON.stringify(next.context.rules),/retrieve_project_evidence/);
    const content={status:'ok',data:{notes:[{claim:'fixture research',refs:[],kind:'gap'}],framing:{target_user:'Fixture teams',scenario:'Synthetic retrieval',questions:['What is repeated?']}},evidence_ids:[],gaps:[],tool_calls:requests===1?[{name:'retrieve_project_evidence',arguments:{query:'fixture research'}}]:[]};
    return Response.json({usage:{prompt_tokens:11,completion_tokens:3},choices:[{finish_reason:'stop',message:{content:JSON.stringify(unknownAlternativeWire(content))}}]},{headers:{'x-request-id':'synthetic-attached-'+requests}});
   };
   const started=(await api(await project(),'start',undefined,{allowSupplement:true})).project,result=await api(started,'advance');
   assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.project.workflow.status,'ready',JSON.stringify(result.project.workflow));assert.equal(result.project.workflow.stage,'collect');assert.equal(requests,2);assert.equal(result.project.workflow.budget.modelAttempts,2);
   const record=result.project.workflow.records[0];assert.ok(record.agentTools.some(t=>t.name==='retrieve_project_evidence'&&t.status==='executed'));assert.equal(record.agentModelReceipts.length,2);assert.deepEqual(record.usage,{input_tokens:22,output_tokens:6});assert.equal(record.requestId,'synthetic-attached-2');
  }finally{globalThis.fetch=previousFetch;}
 });
 // Reconstruct an expired in-flight state from a confirmed checkpoint. Guards
 // operate before invoking the SDK and never consume a new model reservation.
 const recoverable=structuredClone(before);
 for(const [label,mutate] of [
  ['changed evidence',p=>p.evidenceVersion=(p.evidenceVersion||0)+1],
  ['active lease',p=>p.workflow.lease={callId:p.workflow.records[0].id,expires:new Date(Date.now()+60000).toISOString()}],
  ['rejected citation',p=>p.workflow.error='INVALID_EVIDENCE_QUOTE'],
  ['foreign thread',p=>p.workflow.records[0].harnessThreadId='other:run:call'],
  ['paused project',p=>p.status='paused'],
 ])await check('stage recovery refuses '+label,async()=>{const changed=structuredClone(recoverable);mutate(changed);assert.equal((await stageRecovery(originalDb,changed)).allowed,false)});
 console.log(`Harness routes: ${passed} checks passed; real model calls: 0.`);
}finally{globalThis.__testEnv.DB=originalDb;globalThis.fetch=originalFetch;globalThis.__testEnv.DASHSCOPE_API_KEY=originalKey;globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED=originalGate;for(const id of owned)await originalDb.prepare('DELETE FROM research_projects WHERE id=?').bind(id).run()}
