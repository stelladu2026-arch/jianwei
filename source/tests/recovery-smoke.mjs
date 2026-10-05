import assert from 'node:assert/strict';
import {requestJSON} from '../lib/research/browser-api.ts';
import {runRetryBlockReason,controlRun} from '../lib/research/execution-controls.ts';
import {workflowRetryBlockReason,controlWorkflow} from '../lib/research/workflow.ts';
import {locateChecks} from '../lib/research/collaboration.ts';
let passed=0;
async function check(label,fn){await fn();passed++;console.log('PASS '+label)}
await check('authentication HTML gives recovery guidance without showing page contents',async()=>{
  await assert.rejects(requestJSON('/api/projects',{},async()=>new Response('<html>private token secret</html>',{headers:{'content-type':'text/html'}})),e=>/重新打开见微/.test(e.message)&&!e.message.includes('secret'));
});
await check('write network failure does not replay a possibly accepted mutation',async()=>{
  let calls=0;await assert.rejects(requestJSON('/api/projects',{method:'PATCH'},async()=>{calls++;throw new TypeError('network')}),/可能已提交/);assert.equal(calls,1);
});
await check('version conflicts retain actionable server guidance',async()=>{
  await assert.rejects(requestJSON('/api/projects',{},async()=>Response.json({error:'其他操作已更新项目，请刷新后重试。'},{status:409})),/刷新后重试/);
});
await check('manual refresh safely recovers after an incomplete response',async()=>{
  await assert.rejects(requestJSON('/api/projects',{},async()=>new Response('{',{headers:{'content-type':'application/json'}})),/先刷新项目确认结果/);
  assert.deepEqual(await requestJSON('/api/projects',{},async(_url,init)=>{assert.equal(init.redirect,'manual');assert.equal(init.credentials,'same-origin');return Response.json({projects:[]})}),{projects:[]});
});
const task={id:'model',role:'coordinator',status:'failed',attempts:1,error:'MODEL_TIMEOUT',calls:[]};
const run={status:'failed',revision:1,evidenceVersion:0,tasks:[task],budget:{attempts:1,limit:1}};
await check('exhausted standalone retries are blocked consistently in UI and server',()=>{
  assert.match(runRetryBlockReason(run),/预算已用尽/);assert.throws(()=>controlRun({revision:1,evidenceVersion:0,run:structuredClone(run)},'retry'),/预算已用尽/);assert.equal(run.status,'failed');
});
await check('spent model budget does not prevent eligible local-step recovery',()=>{
  const r=structuredClone(run);r.tasks[0].role=null;assert.equal(runRetryBlockReason(r),'');controlRun({revision:1,evidenceVersion:0,run:r},'retry');assert.equal(r.status,'ready');assert.equal(r.budget.attempts,1);
});
const workflow={mode:'single',status:'failed',stage:'collect',revision:1,evidenceVersion:0,records:[],budget:{modelAttempts:0,modelLimit:2,sourceAttempts:21,sourceLimit:30,searches:1,searchLimit:3}};
await check('insufficient collection reservation blocks retry before any source call',()=>{
  const p={revision:1,evidenceVersion:0,budget:{searches:0},workflow:structuredClone(workflow)};assert.match(workflowRetryBlockReason(p),/采集预算/);assert.throws(()=>controlWorkflow(p,'retry'),/采集预算/);assert.equal(p.workflow.status,'failed');
});
await check('four-role model failure stays stopped even with unused total budget',()=>{
  const p={revision:1,evidenceVersion:0,budget:{searches:0},workflow:{...structuredClone(workflow),mode:'four',stage:'verifier'}};assert.match(workflowRetryBlockReason(p),/本轮不能追加重试/);assert.throws(()=>controlWorkflow(p,'retry'),/本轮不能追加重试/);
});
const output={evidence_ids:['E1'],data:{notes:[{claim:'Synthetic claim',refs:['E1']}],checks:[{target:'note:0',judgment:'supports',anchors:[]}]}},input={role:'verifier',evidence:[]};
await check('anchorless supported claims produce a safe precise failure path',()=>{
  const issues=[];assert.throws(()=>locateChecks(output,input,x=>issues.push(x)),/INVALID_REVIEW_COVERAGE/);assert.deepEqual(issues,['data.checks.0.anchors:required_for_judgment']);
});
await check('forbidden role fields are diagnosed without storing rejected text',()=>{
  const issues=[];assert.throws(()=>locateChecks({...output,data:{...output.data,proposal:{problem:'private rejected text'}}},input,x=>issues.push(x)),/INVALID_REVIEW_COVERAGE/);assert.deepEqual(issues,['data.proposal:not_allowed_for_role']);assert.ok(!issues.join('').includes('private'));
});
console.log(JSON.stringify({recovery_checks:passed,actual_model_calls:0,scope:'browser response handling, shared retry guards and safe rejection diagnostics; no visual or live-model claims'}));
