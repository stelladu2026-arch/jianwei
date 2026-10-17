// Real HTTP adapter and route handlers, with all external HTTP replaced by fixtures.
import assert from 'node:assert/strict';
import {QWEN_BASE_URL,QWEN_MODEL,QWEN_MAX_OUTPUT_TOKENS} from '../lib/research/provider-config.ts';
import {QwenModel,requireQwenCredentials} from '../lib/research/qwen-model.ts';
import {makeRun,buildTask,reserve,executeModel} from '../lib/research/execution.ts';
import {create as storeCreate} from '../lib/research/store.ts';
import {fixtureProject} from '../lib/research/evaluation.ts';
const key='sk-synthetic-test-key-only',owned=[];
let passed=0,requests=0,scenario='normal',pendingRelease;
const beforeFetch=globalThis.fetch;
function check(label,fn){fn();passed++;console.log('PASS '+label)}
async function api(path,method='GET',body,secret=key){const res=await globalThis.__apiTestFetch('http://test.local'+path,{method,headers:{'content-type':'application/json',...(secret?{'x-qwen-api-key':secret}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()}}
async function control(p,action,extra={},secret=key,callId=crypto.randomUUID()){return api(`/api/projects/${p.id}/run`,'POST',{version:p.version,callId,action,adapter:'qwen',freeTierOnlyConfirmed:true,...extra},secret)}
async function read(p){return (await api(`/api/projects/${p.id}/run`)).data.project}
async function create(){const p=fixtureProject('baseline');p.mode='manual';p.title='Synthetic Qwen HTTP fixture only';p.evidence=p.evidence.map(e=>({...e,kind:'imported',source:'Synthetic authorized adapter fixture only'}));owned.push(p.id);return storeCreate(p)}
globalThis.fetch=async(url,init)=>{
  requests++;
  assert.equal(url,QWEN_BASE_URL+'/chat/completions');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+key);
  const body=JSON.parse(init.body),task=JSON.parse(body.messages[1].content);
  assert.equal(body.model,QWEN_MODEL);assert.equal(body.enable_thinking,false);assert.equal(body.stream,false);assert.equal(body.max_tokens,QWEN_MAX_OUTPUT_TOKENS);assert.equal(body.response_format.json_schema.strict,true);assert.ok(!init.body.includes(key));assert.equal(task.context.simulation,false);assert.deepEqual(body.response_format.json_schema.schema.properties.evidence_ids.items.enum,[...new Set(task.evidence_ids)]);
  if(scenario==='pending')await new Promise(resolve=>{pendingRelease=resolve});
  if(scenario==='redirect')return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/model'}});
  if(scenario==='network')throw new Error('private upstream error '+key);
  if(scenario==='quota')return Response.json({error:{code:'AllocationQuota.FreeTierOnly',message:'private '+key}},{status:403});
  if(scenario==='auth')return Response.json({error:{message:'private '+key}},{status:401});
  if(scenario==='rate')return Response.json({error:{message:'private '+key}},{status:429});
  const refs=task.evidence_ids.slice(0,1),result={status:'partial',data:{notes:[{claim:'Synthetic HTTP fixture; not a semantic quality test.',refs,kind:'hypothesis'}]},evidence_ids:refs,gaps:['Only a synthetic fixture.']};
  if(task.role==='coordinator')result.data.proposal={title:'Synthetic fixture',problem:'unverified',audience:'fixture users',alternative:'unverified',conclusion:'unverified',decision:'evidence',payment:'none',refs,counter:'unknown',unknowns:'unknown',plan:'manual review'};
  if(scenario==='foreign')result.data.notes[0].refs=['FOREIGN'];if(scenario==='missing_declared')result.evidence_ids=[];
  const content=scenario==='json'?'not JSON':JSON.stringify(result),usage=scenario==='no_usage'?undefined:{prompt_tokens:123,completion_tokens:45};
  return Response.json({model:'untrusted-envelope-alias',usage,choices:[{finish_reason:scenario==='truncated'?'length':'stop',message:{content,reasoning_content:'private reasoning should never persist'}}]},{headers:{'x-request-id':'fixture-request-1'}});
};
try{
const adapterFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{assert.equal(url,QWEN_BASE_URL+'/chat/completions');assert.equal(init.method,'HEAD');assert.equal(init.redirect,'manual');assert.equal(init.headers,undefined);assert.equal(init.body,undefined);return new Response(null,{status:401});};
const probe=await api('/api/model-status','POST');
check('transport probe sends no credentials or model input',()=>{assert.equal(probe.data.reachable,true);assert.equal(probe.data.httpStatus,401);assert.equal(probe.data.modelRequests,0);assert.equal(requests,0)});
globalThis.fetch=adapterFetch;
globalThis.__testEnv.DASHSCOPE_API_KEY=key;globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='false';
let p=await create();let x=await control(p,'start');check('browser cannot override server free-tier protection gate',()=>{assert.equal(x.status,400);assert.equal(requests,0)});
globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
globalThis.fetch=async(url,init)=>{assert.equal(url,QWEN_BASE_URL+'/chat/completions');assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');assert.equal(init.body,'{}');assert.equal(init.headers.Authorization,'Bearer '+key);return Response.json({error:{code:'invalid_api_key',message:key}},{status:401});};
const authProbe=await api('/api/model-status','POST',{action:'auth'});
check('auth probe cannot generate and discards private provider messages',()=>{assert.equal(authProbe.data.httpStatus,401);assert.equal(authProbe.data.errorCode,'invalid_api_key');assert.equal(authProbe.data.modelRequests,0);assert.ok(!JSON.stringify(authProbe.data).includes(key));assert.equal(requests,0)});
globalThis.fetch=adapterFetch;
x=await control(p,'start',{freeTierOnlyConfirmed:false});check('zero paid budget requires explicit free-tier protection confirmation',()=>{assert.equal(x.status,400);assert.equal(requests,0)});
delete globalThis.__testEnv.DASHSCOPE_API_KEY;
x=await control(p,'start');check('browser header cannot supply or override the server secret',()=>{assert.equal(x.status,400);assert.equal(requests,0)});
const status=await api('/api/model-status');check('configuration status exposes booleans and public metadata only',()=>{assert.equal(status.data.keyConfigured,false);assert.equal(status.data.ready,false);assert.ok(!JSON.stringify(status.data).includes(key))});
assert.equal(status.data.keyChecks.present,false);
globalThis.__testEnv.DASHSCOPE_API_KEY='"'+key+'"';
const quoted=await api('/api/model-status');assert.equal(quoted.data.keyConfigured,false);assert.equal(quoted.data.keyChecks.present,true);assert.equal(quoted.data.keyChecks.containsQuotes,true);assert.ok(!JSON.stringify(quoted.data).includes(key));
globalThis.__testEnv.DASHSCOPE_API_KEY=key;

check('opaque credentials permit printable punctuation but reject header injection',()=>{
  const opaque='sk-synthetic.opaque+token=/only';
  assert.equal(requireQwenCredentials(opaque,true,true),opaque);
  for(const unsafe of ['sk-test\r\nInjected: value','sk-test token','"sk-synthetic-key"','sk-test\u0000token'])assert.throws(()=>requireQwenCredentials(unsafe,true,true));
});

x=await control(p,'start',{limit:5});check('first Qwen test cannot exceed four attempts',()=>assert.equal(x.status,400));
x=await control(p,'start',{scenario:'timeout_once'});check('fault injection is restricted to simulation',()=>assert.equal(x.status,400));
p=(await control(p,'start')).data.project;check('single Qwen run defaults to one attempt and starts without HTTP',()=>{assert.equal(p.run.budget.limit,1);assert.equal(p.run.adapter,'qwen');assert.equal(p.run.simulation,false);assert.equal(p.run.paidBudget,0);assert.equal(requests,0);assert.ok(!JSON.stringify(p).includes(key))});
delete globalThis.__testEnv.DASHSCOPE_API_KEY;x=await control(p,'advance');check('removed server credentials block advance without consuming budget',()=>{assert.equal(x.status,400);assert.equal(requests,0)});globalThis.__testEnv.DASHSCOPE_API_KEY=key;
const old=p,id=crypto.randomUUID();p=(await control(p,'advance',{},key,id)).data.project;
x=await control(old,'advance',{},key,id);check('HTTP request stays idempotent and keeps trusted usage metadata',()=>{assert.equal(requests,1);assert.equal(x.status,200);assert.equal(p.budget.modelCalls,1);assert.equal(p.run.budget.requests,1);assert.equal(p.run.tasks[0].output.model,QWEN_MODEL);assert.deepEqual(p.run.tasks[0].calls[0].usage,{input_tokens:123,output_tokens:45});assert.equal(p.run.tasks[0].calls[0].requestId,'fixture-request-1');assert.ok(!JSON.stringify(p).includes(key));assert.ok(!JSON.stringify(p).includes('reasoning_content'))});
delete globalThis.__testEnv.DASHSCOPE_API_KEY;p=(await control(p,'advance',{},null)).data.project;p=(await control(p,'advance',{},null)).data.project;globalThis.__testEnv.DASHSCOPE_API_KEY=key;check('local checks and report need no key or additional model calls',()=>{assert.equal(requests,1);assert.equal(p.run.status,'completed');assert.match(p.run.report,/真实模型生成/);assert.match(p.run.report,/实际费用：待百炼账单核对/);assert.match(p.run.report,/123 \/ 45/);assert.equal(p.reports.length,0);assert.equal(p.opportunities.length,1);assert.equal(p.opportunities[0].status,'draft')});
scenario='missing_declared';p=(await control(p,'start')).data.project;p=(await control(p,'advance')).data.project;check('Qwen constrains IDs in schema and completes redundant declarations only for unchanged allowed nested refs',()=>{assert.equal(p.run.status,'ready');assert.deepEqual(p.run.tasks[0].output.data.notes[0].refs,p.run.tasks[0].output.evidence_ids);assert.deepEqual(p.run.tasks[0].calls[0].normalizations,['nested_refs_declared_in_envelope'])});p=(await control(p,'cancel')).data.project;scenario='normal';
p=(await control(p,'start',{mode:'four'})).data.project;
for(let i=0;i<6;i++)p=(await control(p,'advance')).data.project;
check('four roles share Qwen while verifier remains independent',()=>{assert.equal(p.run.status,'completed');assert.equal(requests,6);assert.equal(p.run.budget.limit,4);assert.ok(p.run.tasks.filter(t=>t.role).every(t=>t.output.model===QWEN_MODEL));assert.deepEqual(p.run.tasks.find(t=>t.role==='verifier').inputSnapshot.context.prior_results,[]);assert.ok(p.run.tasks.filter(t=>t.role).every(t=>!t.inputSnapshot.context.simulation))});
for(const [fault,code,knownUsage] of [['redirect','PROVIDER_REDIRECT_REJECTED',false],['foreign','INVALID_MODEL_REFERENCE',true],['json','INVALID_MODEL_OUTPUT',true],['truncated','MODEL_OUTPUT_TRUNCATED',true],['no_usage','INVALID_PROVIDER_RESPONSE',false],['quota','FREE_QUOTA_EXHAUSTED',false],['auth','PROVIDER_AUTH_ERROR',false],['rate','PROVIDER_RATE_LIMIT',false],['network','PROVIDER_NETWORK_ERROR',false]]){
  scenario=fault;p=(await control(p,'start')).data.project;const count=requests;p=(await control(p,'advance')).data.project;x=await control(p,'retry');
  check(`Qwen ${fault} stops once, sanitizes errors and preserves available usage`,()=>{assert.equal(requests,count+1);assert.equal(p.run.status,'failed');assert.equal(p.run.tasks[0].error,code);assert.equal(p.run.tasks[0].output,undefined);assert.equal(Boolean(p.run.tasks[0].calls[0].usage),knownUsage);assert.equal(x.status,400);assert.ok(!JSON.stringify(p).includes(key));assert.equal(p.run.budget.requests,1)});
  p=(await control(p,'cancel',{},null)).data.project;
}
scenario='pending';p=(await control(p,'start')).data.project;const late=control(p,'advance');
for(let i=0;i<20&&!pendingRelease;i++)await read(p);
assert.ok(pendingRelease);let during=await read(p);p=(await control(during,'pause',{},null)).data.project;pendingRelease();x=await late;p=await read(p);
check('pause discards late Qwen output and marks request usage as uncertain',()=>{assert.equal(x.status,409);assert.equal(p.run.status,'paused');assert.equal(p.run.tasks[0].output,undefined);assert.equal(p.run.tasks[0].calls[0].error,'EXECUTION_INTERRUPTED');assert.equal(p.run.tasks[0].calls[0].usage,undefined);assert.equal(p.run.budget.requests,1);assert.ok(!JSON.stringify(p).includes(key))});
p=(await control(p,'cancel',{},null)).data.project;
scenario='normal';const before=requests;x=await control(p,'evaluate',{},null);check('fixed fourteen evaluations remain synthetic when Qwen is selected',()=>{assert.equal(x.status,200);assert.equal(requests,before);assert.equal(x.data.project.evaluations[0].actualModelCalls,0)});
check('provider credential guard never includes key in error text',()=>assert.throws(()=>requireQwenCredentials(key+' invalid',true,true),error=>!error.message.includes(key)));
const fixture=fixtureProject('baseline');fixture.run=makeRun(fixture,'single');fixture.run.simulation=false;const task=buildTask(fixture,fixture.run,reserve(fixture,crypto.randomUUID()).task,crypto.randomUUID());
await assert.rejects(executeModel(task,new QwenModel(key,async()=>new Promise(()=>{})),20),/MODEL_TIMEOUT/);check('Qwen adapter ignoring abort cannot bypass executor timeout',()=>assert.ok(true));
console.log(JSON.stringify({qwen_http_checks:passed,actual_model_calls:0,scope:'mocked provider HTTP, not live connectivity or semantic model quality'}));
}finally{delete globalThis.__testEnv.DASHSCOPE_API_KEY;delete globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED;globalThis.fetch=beforeFetch;for(const id of owned){const p=(await api(`/api/projects/${id}/run`)).data.project;if(p)await api(`/api/projects/${id}?version=${p.version}`,'DELETE')}}
