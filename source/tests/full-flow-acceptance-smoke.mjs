import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&c.parentURL?.endsWith('.ts')){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return {url:u.href,shortCircuit:true}}return n(s,c)}});
const {claimFlowAcceptance,executeFlowAcceptance,readFlowAcceptance}=await import('../lib/research/full-flow-acceptance.ts');
function database(){const raw=new DatabaseSync(':memory:');raw.exec("CREATE TABLE research_harness_checkpoints(thread_id TEXT);CREATE TABLE research_harness_operations(thread_id TEXT,state TEXT);INSERT INTO research_harness_checkpoints VALUES ('fixture-project:thread');INSERT INTO research_harness_operations VALUES ('fixture-project:thread','done');");return {prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return raw.prepare(sql).get(...args)||null},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}}}}};}
function fixture(scenario='success'){
 let p,models=0,reads=0;const actions=new Set(),stages=['plan','collect','analyze','check','deliver'];
 const call=async(path,method,body)=>{
  if(path==='/api/projects'){p={id:'fixture-project',version:1,evidence:[],opportunities:[],reports:[]};return {status:200,data:{project:structuredClone(p)}}}
  if(method==='GET'){reads++;return {status:200,data:{project:structuredClone(p)}}}
  if(actions.has(body.callId))return {status:200,data:{project:structuredClone(p)}};
  actions.add(body.callId);p.version++;
  if(body.action==='start')p.workflow={harnessVersion:'research-harness/1',mode:'single',allowSupplement:false,status:'ready',stage:'plan',records:[],budget:{modelLimit:scenario==='bad_budget'?8:4,modelAttempts:0,sourceAttempts:0}};
  if(body.action==='pause')p.workflow.status='paused';
  if(body.action==='resume')p.workflow.status='ready';
  if(body.action==='advance'){
   const w=p.workflow,stage=w.stage;
   if(['plan','analyze'].includes(stage)){models++;w.budget.modelAttempts++;}
   if(stage==='collect'){w.budget.sourceAttempts=18;p.evidence=[{id:'E1',text:'Fixture only; no real market evidence.'}];}
   if(scenario==='model_failure'&&stage==='plan'){w.status='failed';w.error='PROVIDER_NETWORK_ERROR';w.records.push({state:'failed',outputIssues:['provider.network:CONNECTION_RESET']});}
   else{w.records.push({state:'done',usage:['plan','analyze'].includes(stage)?{input_tokens:10,output_tokens:5}:undefined});const next=stages[stages.indexOf(stage)+1];w.stage=next||'deliver';w.status=next?'ready':'completed';if(!next){w.report='Fixture report';p.opportunities=[{status:'draft',refs:['E1']}];}}
  }
  if(body.action==='report')p.reports.push({body:'Fixture report'});
  return {status:200,data:{project:structuredClone(p)}};
 };return {call,models:()=>models,reads:()=>reads};
}
let checks=0;const buildRef='b'.repeat(40),now=Date.parse('2026-10-28T04:00:00Z');
const db=database();assert.equal((await readFlowAcceptance(db)).state,'not_started');checks++;
const claims=await Promise.all([claimFlowAcceptance(db,buildRef,now),claimFlowAcceptance(db,buildRef,now)]);assert.equal(claims.filter(c=>c.claimed).length,1);checks++;
const success=fixture();const report=await executeFlowAcceptance({db,buildRef,call:success.call});assert.equal(report.state,'success');assert.equal(report.modelAttempts,2);assert.equal(success.models(),2);assert.equal(report.reportSaved,true);assert.equal(report.draftCount,1);assert.equal(report.pauseResumePreserved,true);assert.equal(report.duplicateStageDidNotCallModel,true);assert.ok(success.reads()>=3);checks++;
assert.equal((await claimFlowAcceptance(db,buildRef,now)).claimed,false);await assert.rejects(()=>executeFlowAcceptance({db,buildRef,call:success.call}),/CLAIM_REQUIRED/);assert.equal(success.models(),2);checks++;
const failedDb=database(),failed=fixture('model_failure');await claimFlowAcceptance(failedDb,buildRef,now);const failure=await executeFlowAcceptance({db:failedDb,buildRef,call:failed.call});assert.equal(failure.state,'failed');assert.equal(failure.errorCode,'PROVIDER_NETWORK_ERROR');assert.equal(failed.models(),1);assert.equal(failure.steps.length,1);assert.equal((await claimFlowAcceptance(failedDb,buildRef,now)).claimed,false);checks++;
const badDb=database(),bad=fixture('bad_budget');await claimFlowAcceptance(badDb,buildRef,now);const badReport=await executeFlowAcceptance({db:badDb,buildRef,call:bad.call});assert.equal(badReport.state,'failed');assert.equal(badReport.errorCode,'FLOW_BUDGET_OR_RUNTIME_MISMATCH');assert.equal(bad.models(),0);checks++;
assert.equal((await claimFlowAcceptance(database(),buildRef,Date.parse('2026-10-30'))).report.state,'authorization_expired');checks++;
console.log(JSON.stringify({full_flow_grant_checks:checks,real_http_requests:0,real_model_calls:0,scope:'atomic grant and orchestration fixtures only; real routes and provider acceptance remain separate'}));
