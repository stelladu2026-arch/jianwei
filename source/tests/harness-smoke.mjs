// Executes the real Deep Agents package and SQL saver. Network is blocked.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true}}return next(specifier,context)}});
const {runResearchHarness,HARNESS_RUNTIME}=await import('../lib/research/harness/runner.ts');
const {HarnessJournal,initializeHarnessDatabase}=await import('../lib/research/harness/storage.ts');
const {ResearchCheckpointSaver}=await import('../lib/research/harness/checkpointer.ts');
const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}}};
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('LIVE_NETWORK_FORBIDDEN')};
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const source={id:'E1',title:'Fixture',text:'alpha-marker repeated research setup creates a synthetic evidence example.',source:'Imported',kind:'imported',excluded:false,date:'2026-10-01',fetched:'2026-10-01',author:'fixture',thread:'one',url:'',stance:'context',truncated:false};
const task={project_id:'p1',run_id:'r1',revision:1,call_id:'c1',role:'needs',brief:{title:'Fixture'},evidence_ids:['E1'],evidence:[{id:source.id,text:source.text}],context:{rules:[],memories:[],prior_results:[],simulation:true,attempt:1,scenario:'normal'}};
const final={status:'partial',data:{notes:[{claim:'Synthetic hypothesis',refs:['E1'],kind:'hypothesis'}]},evidence_ids:['E1'],gaps:['Synthetic fixture'],errors:[],revision:1,usage:{input_tokens:0,output_tokens:0},model:'fixture'};
const budget={modelLimit:2,modelAttempts:1,sourceLimit:10,sourceAttempts:0,searchLimit:3,searches:0,paidBudget:0};
const call=(name='retrieve_project_evidence',query='alpha-marker')=>({name,arguments:{query,id:''}});
const input=(threadId,invoke,over={})=>({threadId,database:db,task,evidence:[source],budget,since:null,allowFollowUp:true,invoke,...over});
try{
  await check('actual SDK invokes an approved tool and returns the existing structured contract',async()=>{
    let requests=0,reserves=0;
    const args=input('happy',async next=>{requests++;if(requests===1)return {final:null,toolCalls:[call()]};assert.match(JSON.stringify(next),/词面重叠/);return {final,toolCalls:[]}}, {beforeModel:async()=>{reserves++}});
    const result=await runResearchHarness(args);
    assert.equal(result.runtime,HARNESS_RUNTIME);assert.deepEqual(result.final,final);assert.equal(requests,2);assert.equal(reserves,1);assert.equal(result.spend.extraModelCalls,1);assert.equal(result.spend.retrieval[0].id,'E1');
    const saved=await new ResearchCheckpointSaver(db).getTuple({configurable:{thread_id:'happy'}});assert.ok(saved);assert.ok(JSON.stringify(saved.checkpoint).includes('/research/evidence/0.json'));
    const resumed=await runResearchHarness({...args,resume:true,invoke:async()=>{throw new Error('COMPLETED_CALL_REPLAYED')}});assert.deepEqual(resumed.final,final);assert.equal(requests,2);
  });
  await check('shared model budget stops the SDK without an extra provider call',async()=>{
    let requests=0;
    const result=await runResearchHarness(input('budget',async()=>{requests++;return {final:null,toolCalls:[call()]}},{budget:{...budget,modelLimit:1}}));
    assert.equal(requests,1);assert.equal(result.final,null);assert.ok(result.spend.trace.some(x=>x.reason==='MODEL_BUDGET'));
  });
  await check('unapproved tools are refused and cannot reach the filesystem or shell',async()=>{
    let requests=0;
    const result=await runResearchHarness(input('unknown',async()=>++requests===1?{final:null,toolCalls:[call('execute','cat /etc/passwd')]}:{final,toolCalls:[]}));
    assert.equal(result.spend.trace[0].reason,'TOOL_NOT_ALLOWLISTED');assert.equal(result.spend.trace[0].name,'execute');
  });
  await check('a changed evidence version cannot reuse a checkpoint',async()=>{
    await assert.rejects(runResearchHarness(input('happy',async()=>({final,toolCalls:[]}),{resume:true,task:{...task,revision:2}})),/HARNESS_INPUT_CHANGED/);
  });
  await check('a result saved before graph commit is reused after process reconstruction',async()=>{
    await initializeHarnessDatabase(db);const journal=new HarnessJournal(db,'journal');let calls=0;
    const first=await journal.execute('model:0',async()=>{calls++;return final});
    const second=await new HarnessJournal(db,'journal').execute('model:0',async()=>{calls++;throw new Error('duplicate')});
    assert.deepEqual(first,second);assert.equal(calls,1);
  });
  await check('a lost external response is never retried automatically',async()=>{
    const journal=new HarnessJournal(db,'uncertain');let calls=0;
    await assert.rejects(journal.execute('model:0',async()=>{calls++;throw new Error('response lost')}),/response lost/);
    await assert.rejects(new HarnessJournal(db,'uncertain').execute('model:0',async()=>{calls++;return final}),/HARNESS_RESULT_UNCERTAIN/);assert.equal(calls,1);
  });
  await check('competing workers cannot execute the same operation twice',async()=>{
    const journal=new HarnessJournal(db,'race');let calls=0;
    const results=await Promise.allSettled([journal.execute('tool:0',async()=>{calls++;return 'done'}),journal.execute('tool:0',async()=>{calls++;return 'done'})]);
    assert.equal(calls,1);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  });
  await check('pending tool writes survive saver recreation and thread deletion is isolated',async()=>{
    const saver=new ResearchCheckpointSaver(db),config={configurable:{thread_id:'happy'}};const tuple=await saver.getTuple(config);
    await saver.putWrites(tuple.config,[['fixture','value']],'task-fixture');
    const restored=await new ResearchCheckpointSaver(db).getTuple(tuple.config);assert.ok(restored.pendingWrites.some(x=>x[0]==='task-fixture'&&x[2]==='value'));
    await saver.deleteThread('happy');assert.equal(await saver.getTuple(config),undefined);assert.ok(await saver.getTuple({configurable:{thread_id:'unknown'}}));
  });
  await check('an SDK checkpoint failure after a finished tool resumes without repeating that tool',async()=>{
    let injected=false,modelCalls=0,retrievalCalls=0;
    const faultDb={prepare(sql){const statement=db.prepare(sql);return {bind(...args){statement.bind(...args);return this},first(){return statement.first()},all(){return statement.all()},async run(){
      const done=sqlite.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id='crash-after-tool' AND operation_id LIKE 'tool:%' AND state='done'").get().n;
      if(!injected&&done&&sql.startsWith('INSERT INTO research_harness_checkpoints')){injected=true;throw new Error('CHECKPOINT_INJECTED_FAILURE')}
      return statement.run();
    }}}};
    const args=input('crash-after-tool',async()=>++modelCalls===1?{final:null,toolCalls:[call()]}:{final,toolCalls:[]},{database:faultDb,retrieve:async()=>{retrievalCalls++;return [{id:source.id,title:source.title,text:source.text}]}});
    await assert.rejects(runResearchHarness(args),/CHECKPOINT_INJECTED_FAILURE/);
    const resumed=await runResearchHarness({...args,database:db,resume:true});
    assert.deepEqual(resumed.final,final);assert.equal(retrievalCalls,1);assert.equal(modelCalls,2);
  });
  await check('parallel SDK tool dispatch cannot overspend a shared source budget',async()=>{
    let requests=0,reservations=0,modelCalls=0;
    globalThis.fetch=async()=>{requests++;return Response.json({hits:[]})};
    try{
      const result=await runResearchHarness(input('parallel-tools',async()=>++modelCalls===1?{final:null,toolCalls:[call('hacker_news_search','alpha'),call('hacker_news_search','beta')]}:{final,toolCalls:[]},{beforeTool:async()=>{reservations++}}));
      assert.equal(requests,1);assert.equal(reservations,1);assert.equal(result.spend.trace[1].reason,'SOURCE_BUDGET');
    }finally{globalThis.fetch=async()=>{throw new Error('LIVE_NETWORK_FORBIDDEN')}}
  });
  await check('an uncertain tool result cannot trigger another model request inside the SDK',async()=>{
    let calls=0;
    await assert.rejects(runResearchHarness(input('uncertain-tool',async()=>{calls++;return calls===1?{final:null,toolCalls:[call()]}:{final,toolCalls:[]}},{retrieve:async()=>{throw Error('SYNTHETIC_TOOL_RESPONSE_LOST')}})),/HARNESS_RESULT_UNCERTAIN|SYNTHETIC_TOOL_RESPONSE_LOST/);
    assert.equal(calls,1);
  });
  console.log(`Harness: ${passed} checks passed; real model calls: 0.`);
}finally{globalThis.fetch=oldFetch;sqlite.close()}
