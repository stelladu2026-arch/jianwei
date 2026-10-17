import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {componentURL} from './render-component.mjs';
import {newProject} from '../lib/research/domain.ts';
import {create,get} from '../lib/research/store.ts';
import {makeWorkflow,workflowModelCeiling,workflowAdvanceBlockReason,workflowRetryBlockReason,workflowStages} from '../lib/research/workflow.ts';
import {workflowModelUsage,modelStopReason} from '../lib/research/workflow-usage.ts';
import {workflowStageOutcome} from '../lib/research/stage-outcomes.ts';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';
const {ModelRequestSummary}=await import(componentURL(new URL('../components/model-request-summary.tsx',import.meta.url)));
const originalFetch=globalThis.fetch,owned=[];let passed=0,scenario='closing',models=0,sources=0,payloads=[];
async function check(label,fn){await fn();passed++;console.log('PASS '+label)}
const original='Synthetic budget fixture describes repeated configuration questions and existing alternatives. This is not real demand evidence.';
const evidence={id:'E1',title:'Synthetic imported original',text:original,source:'Synthetic offline fixture',date:'2026-10-15',fetched:'2026-10-15',author:'fixture-author',thread:'fixture-thread',url:'',kind:'imported',stance:'context',excluded:false,truncated:false};
const record={id:'fixture-loop',stage:'plan',kind:'model',state:'failed',error:'MODEL_BUDGET',started:'2026-10-15',elapsedMs:1,usage:{input_tokens:60,output_tokens:12},agentModelReceipts:[10,20,30,undefined].map(n=>n===undefined?{}:{usage:{input_tokens:n,output_tokens:4}})};
const history={records:[record],budget:{modelAttempts:4,modelLimit:4}};
function wire(body){return Response.json({usage:{prompt_tokens:10,completion_tokens:4},choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]})}
globalThis.fetch=async(url,init)=>{
 if(String(url)===QWEN_BASE_URL+'/chat/completions'){
  models++;const body=JSON.parse(init.body),task=JSON.parse(body.messages[1].content);payloads.push({task,schema:body.response_format.json_schema.schema});
  if(task.purpose){
   if(scenario==='closing-failure'&&task.allow_tools===false)return Response.json({error:{code:'SyntheticOfflineUnavailable'}},{status:503});
   const tools=scenario==='violates-final'||task.allow_tools!==false?[{name:models===1?'hacker_news_search':'retrieve_project_evidence',arguments:{query:'configuration'}}]:[];
   return wire({status:'ok',data:{notes:[{kind:'gap',claim:'configuration',refs:[]}],framing:{target_user:'Fixture teams',scenario:'Repeated configuration questions',questions:['Which steps repeat?']}},evidence_ids:[],gaps:['Fixture unknown frequency'],tool_calls:tools});
  }
  const refs=task.evidence_ids.slice(0,1);
  return wire({status:'partial',data:{notes:[{kind:'hypothesis',claim:'Synthetic conditional configuration problem',refs}],citations:[],proposal:{title:'Synthetic budget candidate',problem:'Repeated configuration questions',audience:'Fixture teams',alternative:'Existing tools',conclusion:'Synthetic candidate needs evidence',decision:'evidence',payment:'none',refs,counter:'Frequency may be too low',unknowns:'Payment and frequency unknown',plan:'Check actual originals and interview users; plan not executed'}},evidence_ids:refs,gaps:['Fixture only'],tool_calls:[]});
 }
 sources++;
 if(String(url).startsWith('https://hn.algolia.com/api/v1/search?'))return Response.json({hits:[{objectID:'880001'}]});
 if(String(url).startsWith('https://hacker-news.firebaseio.com/v0/item/'))return Response.json({id:880001,type:'story',by:'synthetic-author',time:Math.floor(Date.now()/1000)-60,title:'Synthetic tool original',text:original});
 if(String(url).startsWith('https://zh.wikipedia.org/w/api.php?'))return Response.json({query:{search:[]}});
 throw Error('Unexpected offline request');
};
async function seed(supplement=true){models=0;sources=0;payloads=[];const p=newProject({title:'Synthetic request ceiling fixture',audience:'Fixture teams',decision:'Offline budget regression'});p.confirmed=true;p.status='collecting';p.evidence=[structuredClone(evidence)];owned.push(p.id);await create(p);return (await action(p,'start',{allowSupplement:supplement})).data.project}
async function action(p,action,extra={},callId=crypto.randomUUID()){const response=await globalThis.__apiTestFetch('http://test.local/api/projects/'+p.id+'/workflow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:p.version,callId,action,mode:'single',allowSupplement:true,freeTierOnlyConfirmed:true,...extra})});return {status:response.status,data:await response.json()}}
async function advance(p){const r=await action(p,'advance');assert.equal(r.status,200,JSON.stringify(r.data));return r.data.project}
try{
 globalThis.__testEnv.DASHSCOPE_API_KEY='sk-synthetic-budget-only';globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
 await check('one model stage with several calls counts individual receipts without double-counting aggregate tokens',()=>{const usage=workflowModelUsage(history);assert.equal(usage.stages.length,1);assert.equal(usage.attempts,4);assert.equal(usage.receipts,3);assert.equal(usage.input,60);assert.equal(usage.output,12);assert.equal(usage.unknown,1);assert.equal(usage.stages[0].attempts,4)});
 await check('legacy aggregated records and missing receipts remain honest',()=>{const old={...history,records:[{...record,agentModelReceipts:undefined}],budget:{modelAttempts:1,modelLimit:2}};assert.equal(workflowModelUsage(old).receipts,1);assert.equal(workflowModelUsage(old).input,60);const missing={...old,records:[{...old.records[0],usage:undefined}]};assert.equal(workflowModelUsage(missing).unknown,1);assert.equal(workflowModelUsage(missing).input,0)});
 await check('budget rendering distinguishes stage count, model requests and provider account quota',()=>{const html=renderToStaticMarkup(React.createElement(ModelRequestSummary,{usage:workflowModelUsage(history),stageNames:workflowStages}));assert.ok(html.includes('规划检索：4 次请求，有用量回执 3 次'));assert.ok(html.includes('1 次请求没有用量回执'));assert.ok(html.includes('账户余额、服务免费额度'));assert.ok(!html.includes('规划检索：1 次'))});
 await check('local stage ceilings reserve required analysis without changing round limits',()=>{const p=newProject();p.confirmed=true;p.evidence=[evidence];const w=makeWorkflow(p,true);assert.equal(workflowModelCeiling(w),3);w.stage='gap';assert.equal(workflowModelCeiling(w),3);w.stage='analyze';assert.equal(workflowModelCeiling(w),4);w.stage='plan';w.budget.modelLimit=2;assert.equal(workflowModelCeiling(w),1);w.mode='four';assert.equal(workflowModelCeiling(w),2);assert.equal(w.budget.modelLimit,2)});
 await check('remaining stage allocation is never described as exhausted provider quota',()=>{assert.match(modelStopReason('MODEL_BUDGET',{attempts:4,limit:4}),/本轮已用 4 \/ 4/);assert.match(modelStopReason('MODEL_BUDGET',{attempts:2,limit:4}),/未能在分配次数内完成/);assert.match(modelStopReason('MODEL_STAGE_BUDGET',{attempts:3,limit:4}),/剩余请求为后续分析保留/);assert.equal(modelStopReason('FREE_QUOTA_EXHAUSTED',{attempts:1,limit:4}),'')});
 scenario='closing';let p=await seed(),before=p,callId=crypto.randomUUID();let r=await action(p,'advance',{},callId);assert.equal(r.status,200,JSON.stringify(r.data));p=r.data.project;
 await check('SQLite route finalizes repeated planning tools on request three and preserves request four for analysis',()=>{assert.equal(p.workflow.status,'ready');assert.equal(p.workflow.stage,'analyze');assert.equal(models,3);assert.equal(p.workflow.budget.modelAttempts,3);assert.equal(p.workflow.budget.modelLimit,4);assert.equal(p.workflow.records[0].agentModelReceipts.length,3);assert.deepEqual(payloads.map(p=>p.task.allow_tools===false),[false,false,true]);assert.equal(payloads[2].schema.properties.tool_calls.maxItems,0);assert.match(JSON.stringify(payloads[2].task.context.rules),/最后一次可用模型请求/);assert.ok(p.evidence.some(e=>e.id==='HN880001'))});
 await check('repeating the completed planning request never invokes another model or tool',async()=>{const m=models,s=sources;assert.equal((await action(before,'advance',{},callId)).status,200);assert.equal(models,m);assert.equal(sources,s)});
 p=await advance(p);p=await advance(p);p=await advance(p);
 await check('required analysis and delivery complete at four total calls with final-call tools disabled',()=>{assert.equal(p.workflow.status,'completed');assert.equal(models,4);assert.equal(p.workflow.budget.modelAttempts,4);assert.equal(payloads[3].task.allow_tools,false);assert.equal(payloads[3].schema.properties.tool_calls.maxItems,0);assert.equal(p.opportunities.length,1);assert.equal(p.opportunities[0].status,'draft');assert.equal(workflowModelUsage(p.workflow).receipts,4)});
 p=await seed(false);for(let i=0;i<8&&p.workflow.status==='ready';i++)p=await advance(p);
 await check('two-request workflow closes planning immediately and leaves one real analysis slot',()=>{assert.equal(p.workflow.status,'completed');assert.equal(models,2);assert.ok(payloads.every(p=>p.task.allow_tools===false));assert.ok(payloads.every(p=>p.schema.properties.tool_calls.maxItems===0));assert.equal(p.workflow.budget.modelLimit,2)});
 scenario='violates-final';p=await seed(false);p=await advance(p);
 await check('model ignores finalization contract: strict rejection, no unauthorized source or follow-up request',()=>{assert.equal(p.workflow.error,'INVALID_MODEL_OUTPUT');assert.ok(p.workflow.records[0].outputIssues.includes('tool_calls:disabled_for_task'));assert.equal(models,1);assert.equal(sources,0);assert.equal(p.workflow.budget.modelAttempts,1);assert.equal(p.workflow.records[0].output,undefined);assert.equal(p.opportunities.length,0)});
 scenario='closing-failure';p=await seed();p=await advance(p);
 await check('failed closing call keeps its cost, originals, unknown usage and reserved analysis request',async()=>{assert.equal(p.workflow.error,'PROVIDER_UNAVAILABLE');assert.equal(p.workflow.budget.modelAttempts,3);assert.equal(workflowModelUsage(p.workflow).unknown,1);assert.ok(p.evidence.some(e=>e.id==='HN880001'));assert.match(workflowRetryBlockReason(p),/后续分析保留/);const m=models,v=p.version;const r=await action(p,'retry');assert.equal(r.status,400);assert.equal(models,m);assert.equal((await get(p.id)).version,v);const q=structuredClone(p);q.workflow.status='ready';assert.match(workflowAdvanceBlockReason(q),/后续分析保留/)});
 await check('historical stage report derives exhaustion from its own counter and stays read-only',()=>{const q=structuredClone(p);q.workflow.error='MODEL_BUDGET';q.workflow.budget.modelAttempts=4;const before=JSON.stringify(q),out=workflowStageOutcome(q);assert.match(out.failure,/本轮已用 4 \/ 4/);assert.match(out.failure,/不代表账户余额或免费额度已耗尽/);assert.equal(JSON.stringify(q),before);q.workflow.error='MODEL_STAGE_BUDGET';q.workflow.budget.modelAttempts=3;assert.match(workflowStageOutcome(q).failure,/后续分析保留/)});
 console.log(JSON.stringify({workflow_budget_checks:passed,actual_model_calls:0,scope:'synthetic provider HTTP, real SQLite routes, budget isolation, finalization and React rendering; no live completion claim'}));
}finally{globalThis.fetch=originalFetch;delete globalThis.__testEnv.DASHSCOPE_API_KEY;delete globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED;for(const id of owned){const p=await get(id);if(p)await globalThis.__apiTestFetch('http://test.local/api/projects/'+id+'?version='+p.version,{method:'DELETE'})}}
