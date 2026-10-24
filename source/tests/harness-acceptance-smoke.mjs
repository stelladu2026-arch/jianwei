// Actual SDK + SQL; injected model port only. No real model or cloud database.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyHarnessAcceptance} from '../scripts/verify-harness-live.mjs';
const {AgentToolCalls}=await import('../lib/research/agent-loop.ts');
const {QwenModel}=await import('../lib/research/qwen-model.ts');
const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}}};
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
let requests=0;
const adapter={receipt:{requestId:'fixture-acceptance-receipt',usage:{input_tokens:1,output_tokens:1}},async execute(task){requests++;if(requests%2===1)throw new AgentToolCalls([{name:'retrieve_project_evidence',arguments:{query:'重新整理问题',id:''}}]);return {status:'partial',data:{notes:[{claim:'虚构验收资料不能证明需求或付费。',refs:['E1'],kind:'hypothesis'}]},evidence_ids:['E1'],gaps:['仅工程虚构样例'],errors:[],revision:task.revision,usage:{input_tokens:1,output_tokens:1},model:'fixture'}}};
try{
 await check('acceptance CLI defaults to no requests and requires an explicit bounded grant',()=>{const script=fileURLToPath(new URL('../scripts/verify-harness-live.mjs',import.meta.url));for(const args of [[],['--live','--max-model-calls=2','--paid-budget=0']]){const run=spawnSync(process.execPath,['--experimental-strip-types',script,...args],{encoding:'utf8',timeout:10000});assert.equal(run.status,2);assert.match(run.stderr,/未执行/)}assert.equal(requests,0)});
 const runId=crypto.randomUUID(),options={db,adapter,runId,buildRef:'fixture-commit'};let report;
 await check('one grant verifies actual SDK tool use and SQL recovery with exactly two model-port requests',async()=>{report=await verifyHarnessAcceptance(options);assert.equal(report.passed,true,JSON.stringify(report));assert.equal(report.modelRequestAttempts,2);assert.equal(report.fixtureCleaned,true);assert.equal(report.checkpointRecovery,true);assert.equal(report.completedReplayCalls,0);assert.equal(requests,2);assert.equal(report.confirmedReceipts,2);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM research_harness_threads').get().n,0);assert.equal(sqlite.prepare('SELECT model_attempts FROM research_harness_acceptance_runs WHERE run_id=?').get(runId).model_attempts,2);assert.ok(!JSON.stringify(report).includes('重新整理问题'))});
 await check('restarted builds reuse the small receipt after fixture deletion without another allowance',async()=>{const result=await verifyHarnessAcceptance(options);assert.equal(result.passed,true);assert.equal(result.reused,true);assert.equal(result.requestAttemptsThisInvocation,0);assert.equal(requests,2);await assert.rejects(verifyHarnessAcceptance({...options,buildRef:'a different commit'}),/ACCEPTANCE_INPUT_CHANGED/);assert.equal(requests,2)});
 await check('an uncertain model response is stopped and its grant cannot silently retry',async()=>{let calls=0;const input={db,runId:crypto.randomUUID(),buildRef:'fixture-failure',adapter:{receipt:{requestId:'safe-request',outputIssues:['data.notes.0.refs:outside_input','private value with spaces']},async execute(){calls++;throw Error('SYNTHETIC_RESPONSE_LOST')}}};const failed=await verifyHarnessAcceptance(input);assert.equal(failed.passed,false);assert.equal(failed.modelRequestAttempts,1);assert.equal(calls,1);assert.equal(failed.requestId,'safe-request');assert.deepEqual(failed.fields,['data.notes.0.refs:outside_input']);const repeated=await verifyHarnessAcceptance(input);assert.equal(repeated.passed,false);assert.equal(repeated.requestAttemptsThisInvocation,0);assert.equal(calls,1)});
 await check('an unfinished acceptance grant refuses reconstruction before any model request',async()=>{const id=crypto.randomUUID();sqlite.prepare("INSERT INTO research_harness_acceptance_runs VALUES (?,?,'started',1,NULL,?)").run(id,'harness-live-acceptance/1:fixture-interrupted','today');await assert.rejects(verifyHarnessAcceptance({db,adapter,runId:id,buildRef:'fixture-interrupted'}),/ACCEPTANCE_RESULT_UNCERTAIN/);assert.equal(requests,2)});
 await check('competing acceptance workers cannot both receive a two-request allowance',async()=>{let count=0;const shared={receipt:{},async execute(task){count++;if(count===1)throw new AgentToolCalls([{name:'retrieve_project_evidence',arguments:{query:'重新整理问题',id:''}}]);return {status:'partial',data:{notes:[{claim:'虚构样例，判断仍未知。',refs:['E1'],kind:'hypothesis'}]},evidence_ids:['E1'],gaps:['仅虚构样例'],errors:[],revision:task.revision,usage:{input_tokens:0,output_tokens:0},model:'fixture'}}};const input={db,adapter:shared,runId:crypto.randomUUID(),buildRef:'fixture-race'};const results=await Promise.allSettled([verifyHarnessAcceptance(input),verifyHarnessAcceptance(input)]);assert.equal(results.filter(x=>x.status==='fulfilled'&&x.value.passed).length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.message==='ACCEPTANCE_RESULT_UNCERTAIN').length,1);assert.equal(count,2)});
 await check('Qwen JSON envelopes preserve attached tool requests through SQL recovery and finalization',async()=>{
  let calls=0;
  const qwen=new QwenModel('fixture-key-only',async(_url,init)=>{
   calls++;
   const request=JSON.parse(init.body),next=JSON.parse(request.messages[1].content);
   if(calls===2){assert.equal(next.allow_tools,false);assert.match(JSON.stringify(next.context.rules),/应用工具回执/);assert.match(JSON.stringify(next.context.rules),/retrieve_project_evidence/);}
   const wire={citation_format:'citation-selections/1',fact_format:'source-quote/1',status:'partial',data:{notes:[{claim:'虚构资料仅用于验证接口，不能证明需求或付款。',kind:'hypothesis',refs:['E1']}],citation_quote_ids:[]},evidence_ids:['E1'],gaps:['工程样例不构成市场事实'],tool_calls:calls===1?[{name:'retrieve_project_evidence',arguments:{query:'重新整理问题'}}]:[]};
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}],usage:{prompt_tokens:10,completion_tokens:5}},{headers:{'x-request-id':'fixture-wire-'+calls}});
  });
  const options={db,adapter:qwen,runId:crypto.randomUUID(),buildRef:'fixture-qwen-json-wire'};
  const result=await verifyHarnessAcceptance(options);
  assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.modelRequestAttempts,2);assert.equal(result.confirmedReceipts,2);assert.equal(result.checkpointRecovery,true);assert.equal(result.completedReplayCalls,0);assert.equal(calls,2);
  assert.equal((await verifyHarnessAcceptance(options)).requestAttemptsThisInvocation,0);assert.equal(calls,2);
 });
 await check('a valid direct conclusion without tools fails acceptance once and cannot gain another allowance',async()=>{
  let calls=0;
  const options={db,runId:crypto.randomUUID(),buildRef:'fixture-no-tool',adapter:{receipt:{},async execute(task){calls++;return {status:'partial',data:{notes:[{claim:'虚构资料没有证明真实需求。',refs:['E1'],kind:'hypothesis'}]},evidence_ids:['E1'],gaps:['仅工程样例'],errors:[],revision:task.revision,usage:{input_tokens:1,output_tokens:1},model:'fixture'}}}};
  const result=await verifyHarnessAcceptance(options);assert.equal(result.passed,false);assert.equal(result.errorCode,'MODEL_TOOL_LOOP_NOT_OBSERVED');assert.equal(result.modelRequestAttempts,1);assert.equal(result.fixtureCleaned,true);assert.equal(calls,1);
  assert.equal((await verifyHarnessAcceptance(options)).requestAttemptsThisInvocation,0);assert.equal(calls,1);
 });
 console.log(`Acceptance grant: ${passed} checks passed; real model calls: 0; real Turso calls: 0.`);
}finally{sqlite.close()}
