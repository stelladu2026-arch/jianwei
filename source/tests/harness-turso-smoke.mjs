// Exercises the actual SDK against the Turso HTTP wire boundary with a local
// SQLite server substitute. This is not a claim of real Turso connectivity.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true}}return next(specifier,context)}});
const {createHarnessTursoDatabase}=await import('../lib/research/harness/turso-http.ts');
const {runResearchHarness}=await import('../lib/research/harness/runner.ts');
const {ResearchCheckpointSaver}=await import('../lib/research/harness/checkpointer.ts');
const sqlite=new DatabaseSync(':memory:');let http=0,modelCalls=0,retrievals=0,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const token='synthetic-token-only';
const transport=async(url,init)=>{
 http++;assert.equal(url,'https://fixture.turso.io/v2/pipeline');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+token);assert.ok(!init.body.includes(token));
 const pipeline=JSON.parse(init.body);assert.equal(pipeline.requests.length,2);assert.equal(pipeline.requests[1].type,'close');const {sql,args}=pipeline.requests[0].stmt,stmt=sqlite.prepare(sql),values=args.map(x=>x.type==='null'?null:x.type==='integer'||x.type==='float'?Number(x.value):x.value),cols=stmt.columns();let rows=[],affected=0;
 if(cols.length)rows=stmt.all(...values).map(row=>cols.map(col=>{const value=row[col.name];return value===null?{type:'null'}:typeof value==='number'?{type:'integer',value:String(value)}:{type:'text',value}}));else affected=Number(stmt.run(...values).changes);
 return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:cols.map(c=>({name:c.name})),rows,affected_row_count:affected}}},{type:'ok',response:{type:'close'}}]});
};
const db=createHarnessTursoDatabase({url:'libsql://fixture.turso.io',token,fetch:transport});
const source={id:'E1',title:'fixture',text:'Fixture original contains marker setup repetition.',kind:'imported',excluded:false};
const task={project_id:'turso-fixture',run_id:'r',call_id:'c',revision:1,role:'needs',brief:{title:'Fixture only'},evidence_ids:['E1'],evidence:[source],context:{rules:[],memories:[],prior_results:[],simulation:true,attempt:1,scenario:'normal'}};
const final={status:'partial',data:{notes:[{claim:'Fixture conditional claim',refs:['E1'],kind:'hypothesis'}]},evidence_ids:['E1'],gaps:['Synthetic'],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'fixture'};
try{
 await check('SQL read/write values and affected counts survive the HTTP envelope',async()=>{await db.prepare('CREATE TABLE transport_fixture (id TEXT PRIMARY KEY,n INTEGER,v TEXT)').run();assert.equal((await db.prepare('INSERT INTO transport_fixture VALUES (?,?,?)').bind('one',2,null).run()).meta.changes,1);assert.deepEqual(await db.prepare('SELECT * FROM transport_fixture').first(),{id:'one',n:2,v:null})});
 const args={database:db,task,evidence:[source],since:null,allowFollowUp:true,budget:{modelLimit:2,modelAttempts:1,sourceLimit:0,sourceAttempts:0,searchLimit:0,searches:0,paidBudget:0},retrieve:async()=>{retrievals++;return [source]},invoke:async()=>{modelCalls++;return modelCalls===1?{final:null,toolCalls:[{name:'retrieve_project_evidence',arguments:{query:'marker',id:''}}],receipt:{requestId:'fixture-first',usage:{input_tokens:3,output_tokens:2}}}:{final,toolCalls:[],receipt:{requestId:'fixture-final',usage:{input_tokens:4,output_tokens:2}}}}};
 await check('actual SDK tool loop persists its checkpoint and receipts through Turso HTTP',async()=>{const result=await runResearchHarness(args);assert.deepEqual(result.final,final);assert.equal(modelCalls,2);assert.equal(retrievals,1);assert.equal(result.receipts.length,2);assert.ok(http>10)});
 await check('a fresh HTTP client restores a completed thread without another model call',async()=>{const database=createHarnessTursoDatabase({url:'https://fixture.turso.io',token,fetch:transport});const result=await runResearchHarness({...args,database,resume:true,invoke:async()=>{throw Error('model replay')}});assert.deepEqual(result.final,final);assert.equal(result.receipts.length,2);await new ResearchCheckpointSaver(database).deleteThread('turso-fixture:r:c');assert.equal(await new ResearchCheckpointSaver(database).getTuple({configurable:{thread_id:'turso-fixture:r:c'}}),undefined)});
 await check('transport failures do not retry or expose SQL/token/provider body',async()=>{for(const fail of [async()=>{throw Error('private '+token)},async()=>new Response('private '+token,{status:503}),async()=>Response.json({results:[{type:'error',error:{message:'private '+token}}]})]){let attempts=0;const bad=createHarnessTursoDatabase({url:'libsql://fixture.turso.io',token,fetch:async(...input)=>{attempts++;return fail(...input)}});await assert.rejects(bad.prepare('SELECT secret_fixture').all(),e=>e.message==='HARNESS_STORAGE_UNAVAILABLE');assert.equal(attempts,1)}});
 await check('credentials cannot be sent to a non-Turso or insecure host',async()=>{for(const url of ['http://fixture.turso.io','https://turso.io.evil.invalid','https://owner:password@fixture.turso.io','https://fixture.turso.io/path'])assert.throws(()=>createHarnessTursoDatabase({url,token}),/HARNESS_STORAGE_CONFIGURATION/)});
 console.log(`Turso HTTP fixture: ${passed} checks passed; real model calls: 0; real Turso calls: 0.`);
}finally{sqlite.close()}
