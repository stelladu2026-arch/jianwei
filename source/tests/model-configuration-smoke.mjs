import assert from 'node:assert/strict';
import {readModelConfiguration,MODEL_CONFIGURATION_PATH} from '../lib/research/model-configuration.ts';
let passed=0,reads=0;
const configured={keyConfigured:true,freeTierOnlyConfirmed:true,ready:true},fixtureKey='sk-synthetic-status-only';
function check(label,fn){fn();passed++;console.log('PASS '+label)}
const env=globalThis.__testEnv,previous={DB:env.DB,key:env.DASHSCOPE_API_KEY,free:env.QWEN_FREE_TIER_ONLY_CONFIRMED};
async function fetchStatus(path,options){reads++;assert.equal(path,MODEL_CONFIGURATION_PATH);assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'manual');assert.equal(options.headers.Accept,'application/json');assert.equal(options.headers['Content-Type'],'application/json');assert.ok(!options.body);return globalThis.__apiTestFetch('http://test.local'+path,options)}
try{
  delete env.DASHSCOPE_API_KEY;delete env.QWEN_FREE_TIER_ONLY_CONFIRMED;
  let value=await readModelConfiguration(fetchStatus);
  check('browser status entry distinguishes absent configuration from transport failure',()=>assert.deepEqual(value,{keyConfigured:false,freeTierOnlyConfirmed:false,ready:false}));
  env.DASHSCOPE_API_KEY=fixtureKey;env.QWEN_FREE_TIER_ONLY_CONFIRMED='true';delete env.DB;
  const response=await fetchStatus(MODEL_CONFIGURATION_PATH,{method:'GET',credentials:'same-origin',redirect:'manual',headers:{Accept:'application/json','Content-Type':'application/json'}}),raw=await response.json();
  value=await readModelConfiguration(fetchStatus);
  check('authenticated project entry returns ready status without D1 or provider calls',()=>{assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(value,configured);assert.ok(!JSON.stringify(raw).includes(fixtureKey));assert.ok(!('projects' in raw))});
  value=await readModelConfiguration(async()=>Response.json({modelStatus:{...configured,extra:'ignored'}}));
  check('client retains only public configuration booleans',()=>assert.deepEqual(value,configured));
  for(const status of [401,403])await assert.rejects(readModelConfiguration(async()=>Response.json({error:fixtureKey},{status})),error=>error.message.includes('HTTP '+status)&&!error.message.includes(fixtureKey));
  check('authorization failures report status without exposing raw errors or requesting a key',()=>assert.ok(true));
  await assert.rejects(readModelConfiguration(async()=>new Response('private sign-in document '+fixtureKey,{headers:{'Content-Type':'text/html'}})),error=>error.message.includes('非数据页面')&&!error.message.includes(fixtureKey));
  check('HTML sign-in responses cannot become a ready model',()=>assert.ok(true));
  await assert.rejects(readModelConfiguration(async()=>new Response(null,{status:302,headers:{Location:'https://example.invalid/signin'}})),/授权需要更新/);
  check('status redirects stop without following another origin',()=>assert.ok(true));
  await assert.rejects(readModelConfiguration(async()=>new Response('{invalid private data',{headers:{'Content-Type':'application/json'}})),/响应不完整/);
  await assert.rejects(readModelConfiguration(async()=>Response.json({modelStatus:{...configured,keyConfigured:false}})),/格式异常/);
  check('malformed and inconsistent configuration fails closed',()=>assert.ok(true));
  await assert.rejects(readModelConfiguration(async()=>{throw new TypeError(fixtureKey)}),error=>error.message.includes('连接见微失败')&&!error.message.includes(fixtureKey));
  check('network failures have an actionable safe message',()=>assert.ok(true));
  let attempts=0;
  const transient=async()=>{attempts++;return attempts===1?Response.json({error:fixtureKey},{status:503}):Response.json({modelStatus:configured})};
  await assert.rejects(readModelConfiguration(transient),/HTTP 503/);assert.equal(attempts,1);
  value=await readModelConfiguration(transient);
  check('explicit refresh recovers without hidden retries or cached error state',()=>{assert.equal(attempts,2);assert.deepEqual(value,configured)});
  console.log(JSON.stringify({model_configuration_checks:passed,status_reads:reads,actual_model_calls:0,scope:'real read-only routes and browser request/error contracts; not user-session browser QA'}));
}finally{
  env.DB=previous.DB;
  if(previous.key===undefined)delete env.DASHSCOPE_API_KEY;else env.DASHSCOPE_API_KEY=previous.key;
  if(previous.free===undefined)delete env.QWEN_FREE_TIER_ONLY_CONFIRMED;else env.QWEN_FREE_TIER_ONLY_CONFIRMED=previous.free;
}
