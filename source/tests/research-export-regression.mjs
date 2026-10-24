import assert from 'node:assert/strict';
import {newProject} from '../lib/research/domain.ts';
import {create,get,save,db} from '../lib/research/store.ts';
import {makeRun} from '../lib/research/execution.ts';
import {fourTask} from '../lib/research/collaboration.ts';
import {makeWorkflow,failureDiagnostics} from '../lib/research/workflow.ts';
import {matchesSourceQuery} from '../lib/research/expanded-sources.ts';
import {collectHN,collectZhWiki} from '../lib/research/collection.ts';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';

// Synthetic boundary-sized originals reproduce the exported project's failure;
// no uploaded project, source body, identifier or model output is committed.
const env=globalThis.__testEnv,oldFetch=globalThis.fetch,oldKey=env.DASHSCOPE_API_KEY,oldFree=env.QWEN_FREE_TIER_ONLY_CONFIRMED;
const owned=[];let passed=0,calls=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
function fixture(){
 const p=newProject({title:'Synthetic customer feedback review',audience:'Synthetic small software teams',region:'Synthetic',period:'近一年',exclusions:'',decision:'Synthetic context preparation regression'},false);
 p.confirmed=true;p.status='collecting';p.evidenceVersion=1;
 p.evidence=Array.from({length:12},(_,i)=>({id:'FIX'+i,title:'Synthetic original '+i,text:'Synthetic original about customer feedback. '+ 'x'.repeat(757),source:'Synthetic',date:'2026-10-01',fetched:'2026-10-01T00:00:00.000Z',author:'fixture'+i,thread:'fixture:'+i,url:'https://example.invalid/'+i,kind:'imported',stance:'context',excluded:false,truncated:true}));
 const w=makeWorkflow(p,false,'four');p.workflow=w;w.stage='synthesis';w.usableIds=p.evidence.map(e=>e.id);w.budget.modelAttempts=3;w.budget.stageAttempts={needs:1,commercial:1,verifier:1};p.budget.modelCalls=3;
 w.frozen={brief:{title:p.title,audience:p.audience,scenario:'Synthetic context. '+ 'b'.repeat(800)},evidence:structuredClone(p.evidence),memories:[],fingerprint:'synthetic-input'};
 const r=makeRun(p,'four','normal',8);r.adapter='qwen';r.model='qwen3.7-plus';r.simulation=false;r.budget.attempts=3;r.budget.requests=3;w.analysisRun=r;
 for(const t of r.tasks.filter(t=>t.role&&t.role!=='coordinator')){
  t.status='done';t.attempts=1;t.output={status:'partial',data:{notes:[0,1].map(i=>({claim:'Synthetic prior conclusion '+i+' '+ 'n'.repeat(115),refs:['FIX0','FIX1','FIX2'],kind:'hypothesis'})),checks:[0,1].map(i=>({target:'note:'+i,judgment:'partial',reason:'Synthetic support assessment '+ 'r'.repeat(80),anchors:[{evidence_id:'FIX0',quote:p.evidence[0].text.slice(0,50)}]}))},evidence_ids:['FIX0','FIX1','FIX2'],gaps:[],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'qwen3.7-plus'};
  // Valid stored first-role inputs are only needed by the final local checker.
  t.inputSnapshot={project_id:p.id,run_id:r.id,revision:1,call_id:crypto.randomUUID(),role:t.role,review:true,brief:w.frozen.brief,evidence_ids:w.usableIds,evidence:w.frozen.evidence};
  w.records.push({id:crypto.randomUUID(),stage:t.id,kind:'model',state:'done',started:p.created,elapsedMs:1,error:'',usage:{input_tokens:1,output_tokens:1}});
 }
 return p;
}
async function action(p,action,callId=crypto.randomUUID()){
 const response=await globalThis.__apiTestFetch('http://test.local/api/projects/'+p.id+'/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:p.version,callId,action,mode:'four',freeTierOnlyConfirmed:true})});return {status:response.status,data:await response.json()};
}
try{
 env.DASHSCOPE_API_KEY='sk-synthetic-export-regression';env.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
 await check('coordinator fits bounded summaries without changing any frozen source or earlier output',async()=>{
  const p=fixture(),before=JSON.stringify(p.workflow.frozen),outputs=JSON.stringify(p.workflow.analysisRun.tasks.filter(t=>t.output).map(t=>t.output));
  const task=fourTask(p,p.workflow,crypto.randomUUID());
  assert.ok(JSON.stringify(task).length<=16000);assert.equal(task.role,'coordinator');assert.deepEqual(task.context.prior_results.map(r=>r.role),['needs','commercial','verifier']);assert.ok(task.context.prior_results.every(r=>r.data.notes.length>=1));assert.deepEqual(task.evidence,p.workflow.frozen.evidence);assert.equal(JSON.stringify(p.workflow.frozen),before);assert.equal(JSON.stringify(p.workflow.analysisRun.tasks.filter(t=>t.output).map(t=>t.output)),outputs);assert.equal(p.workflow.budget.modelAttempts,3);
 });
 await check('oversized preparation persists a visible zero-call failure and duplicate advance is idempotent',async()=>{
  let p=fixture();p.workflow.frozen.brief.scenario='oversized '.repeat(2000);owned.push(p.id);p=await create(p);
  globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call')};
  const id=crypto.randomUUID(),result=await action(p,'advance',id);assert.equal(result.status,200,JSON.stringify(result.data));const failed=result.data.project;
  assert.equal(failed.workflow.status,'failed');assert.equal(failed.workflow.error,'CONTEXT_LIMIT');assert.equal(failed.workflow.records.at(-1).preparation,true);assert.equal(failed.workflow.records.at(-1).kind,'local');assert.equal(failed.workflow.analysisRun.tasks.find(t=>t.id==='synthesis').attempts,0);assert.equal(failed.workflow.budget.modelAttempts,3);assert.equal(failed.budget.modelCalls,3);assert.equal(calls,0);assert.equal(failureDiagnostics(failed.workflow).requestId,'');
  const repeat=await action(p,'advance',id);assert.equal(repeat.status,200);assert.equal(repeat.data.project.version,failed.version);assert.equal(calls,0);
  // Simulate a corrected local preparation configuration; explicit retry never
  // invokes a provider, clears usage, or reruns completed roles.
  failed.workflow.frozen.brief.scenario='Synthetic corrected preparation';p=await save(failed,failed.version);
  const retry=await action(p,'retry');assert.equal(retry.status,200,JSON.stringify(retry.data));assert.equal(retry.data.project.workflow.status,'ready');assert.equal(retry.data.project.workflow.budget.modelAttempts,3);assert.equal(retry.data.project.workflow.records.at(-1).error,'CONTEXT_LIMIT');assert.equal(calls,0);
 });
 await check('resuming an existing coordinator calls only that role with all three earlier summaries',async()=>{
  let p=await create(fixture());owned.push(p.id);const before=JSON.stringify(p.workflow.analysisRun.tasks.filter(t=>t.output).map(t=>t.output));
  globalThis.fetch=async(url,init)=>{
   assert.equal(url,QWEN_BASE_URL+'/chat/completions');calls++;const task=JSON.parse(JSON.parse(init.body).messages[1].content);
   assert.equal(task.role,'coordinator');assert.deepEqual(task.context.prior_results.map(r=>r.role),['needs','commercial','verifier']);assert.deepEqual(task.evidence,p.workflow.frozen.evidence);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({review_format:'claim-anchors/1',status:'partial',data:{notes:[{claim:'Synthetic evidence remains insufficient.',kind:'gap'}],proposal:{title:'Synthetic conditional opportunity',problem:'Synthetic problem remains a hypothesis',audience:'Synthetic teams',alternative:'Existing tools',conclusion:'Synthetic evidence remains insufficient',decision:'evidence',payment:'none',counter:'Existing tools may suffice',unknowns:'Frequency and payment unknown',plan:'Interview actual users; not yet performed'},checks:['note:0','proposal:problem','proposal:conclusion'].map(target=>({target,judgment:'insufficient',reason:'Synthetic missing evidence',anchors:[]})),disagreements:[]},gaps:['Synthetic unknowns']})}}],usage:{prompt_tokens:10,completion_tokens:10}});
  };
  const result=await action(p,'advance');assert.equal(result.status,200,JSON.stringify(result.data));p=result.data.project;assert.equal(p.workflow.stage,'check');assert.equal(p.workflow.budget.modelAttempts,4);assert.equal(calls,1);assert.equal(JSON.stringify(p.workflow.analysisRun.tasks.filter(t=>t.output&&t.role!=='coordinator').map(t=>t.output)),before);assert.equal(p.workflow.records.at(-1).state,'done');
  for(let i=0;i<2;i++){const next=await action(p,'advance');assert.equal(next.status,200,JSON.stringify(next.data));p=next.data.project;}
  assert.equal(p.workflow.status,'completed');assert.equal(p.workflow.budget.modelAttempts,4);assert.equal(calls,1);assert.equal(p.opportunities.length,1);assert.equal(p.opportunities[0].status,'draft');
 });
 await check('source matching requires every supplied term rather than a generic word alone',()=>{
  assert.equal(matchesSourceQuery('团队整理 OpenClaw 日报及工具动态','小型团队 客户反馈 整理 痛点'),false);
  assert.equal(matchesSourceQuery('小型团队记录客户反馈，整理重复问题和痛点','小型团队 客户反馈 整理 痛点'),true);
  assert.equal(matchesSourceQuery('Startup software tool for fixing production errors','startup customer feedback tool'),false);
  assert.equal(matchesSourceQuery('A startup customer feedback tool','startup customer feedback tool'),true);
  assert.equal(matchesSourceQuery('anything',' '),false);
 });
 await check('unrelated encyclopedia and HN results are rejected without reading comments or adding sources',async()=>{
  let requests=0;
  globalThis.fetch=async url=>{requests++;const u=new URL(String(url));
   if(u.hostname==='hn.algolia.com')return Response.json({hits:[{objectID:'12345'}]});
   if(u.hostname==='hacker-news.firebaseio.com')return Response.json({id:12345,type:'story',title:'Startup production tool',text:'A software tool that automatically fixes production errors, without any feedback management scenario.',by:'fixture',time:Math.floor(Date.now()/1000)-60,kids:[54321]});
   if(u.searchParams.get('list')==='search')return Response.json({query:{search:[{pageid:36986}]}});
   return Response.json({query:{pages:[{pageid:36986,title:'Synthetic unrelated biography',extract:'A political biography containing the word tool, unrelated to customer feedback management.',revisions:[{timestamp:'2026-10-01T00:00:00Z',user:'fixture'}]}]}});
  };
  const hn=await collectHN('startup customer feedback prioritization',null);assert.equal(hn.usableIds.length,0);assert.equal(hn.skipped,1);assert.equal(requests,2);
  const wiki=await collectZhWiki('客户反馈整理',null);assert.equal(wiki.usableIds.length,0);assert.equal(wiki.skipped,1);assert.equal(requests,4);assert.equal(calls,1);
 });
 console.log(`Export regression: ${passed} checks passed; real model calls: 0.`);
}finally{
 globalThis.fetch=oldFetch;if(oldKey===undefined)delete env.DASHSCOPE_API_KEY;else env.DASHSCOPE_API_KEY=oldKey;if(oldFree===undefined)delete env.QWEN_FREE_TIER_ONLY_CONFIRMED;else env.QWEN_FREE_TIER_ONLY_CONFIRMED=oldFree;
 for(const id of owned)await db().prepare('DELETE FROM research_projects WHERE id=?').bind(id).run();
}
