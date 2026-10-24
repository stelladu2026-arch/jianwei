import assert from 'node:assert/strict';
import {runSingleRoleAgent,acceptAgentFinal,AgentStepFailure} from '../lib/research/agent-loop.ts';
import {retrieveSemanticEvidence,QwenEmbedding,EMBEDDING_MODEL} from '../lib/research/semantic-retrieval.ts';
import {validateResult} from '../lib/research/execution.ts';
import {saveOpportunityDraft} from '../lib/research/opportunity-drafts.ts';
import {newProject} from '../lib/research/domain.ts';
import {create,get} from '../lib/research/store.ts';
let passed=0;
async function check(label,fn){await fn();passed++;console.log('PASS '+label)}
const quote='This original describes a confusing configuration workflow.';
const evidence={id:'E1',title:'Source',text:quote,source:'Hacker News',date:'2026-10-01',fetched:'2026-10-01',author:'author',thread:'thread',url:'',kind:'public',stance:'context',excluded:false,truncated:false};
const task={project_id:'P',run_id:'R',revision:1,call_id:'C',role:'needs',brief:{title:'Synthetic'},evidence_ids:['E1'],evidence:[evidence]};
const raw={status:'partial',data:{notes:[{claim:quote,refs:['E1'],kind:'fact'}],citations:[{evidence_id:'E1',quote}]},evidence_ids:['E1'],gaps:[],errors:[],revision:1,usage:{input_tokens:0,output_tokens:0},model:'synthetic'};
const budget={modelLimit:4,modelAttempts:1,sourceLimit:30,sourceAttempts:0,searchLimit:3,searches:0,paidBudget:0};
await check('fact requires a literal current source, not merely an ID or another claim quote',()=>{
  assert.equal(validateResult(raw,task).data.notes[0].kind,'fact');
  for(const data of [{...raw.data,citations:[]},{...raw.data,notes:[{...raw.data.notes[0],claim:'Users actually paid and market demand is verified.'}]}])assert.throws(()=>validateResult({...raw,data},task),/INVALID_EVIDENCE_QUOTE/);
  assert.throws(()=>validateResult(raw,{...task,evidence:[{...evidence,text:'Different current source.'}]}),/INVALID_EVIDENCE_QUOTE/);
});
await check('review fact needs its own supporting target and literal quote',()=>{
  const review={...raw,data:{...raw.data,checks:[{target:'note:0',judgment:'supports',reason:'Literal only',anchors:[{evidence_id:'E1',quote}]}]}};
  assert.doesNotThrow(()=>validateResult(review,{...task,review:true}));
  review.data.checks[0].judgment='insufficient';assert.throws(()=>validateResult(review,{...task,review:true}),/INVALID_EVIDENCE_QUOTE/);
});
await check('hybrid search recalls a semantically related source with no query token overlap',async()=>{
  const unrelated={...evidence,id:'E2',text:'Garden flowers bloom outside in spring weather for the neighborhood.'};
  const adapter={embed:async texts=>{assert.equal(texts.length,3);return [[1,0],[1,0],[0,1]]}};
  const hits=await retrieveSemanticEvidence([evidence,unrelated],'onboarding friction',adapter);
  assert.deepEqual(hits.map(h=>h.id),['E1']);assert.equal(hits[0].mode,'hybrid');assert.equal(hits[0].coverage.indexed,2);
});
await check('excluded or synthetic sources cannot be sent to the embedding adapter',async()=>{
  let inputs;
  await retrieveSemanticEvidence([evidence,{...evidence,id:'SECRET',text:'PRIVATE synthetic corpus marker',kind:'synthetic'},{...evidence,id:'EXCLUDED',excluded:true}],'setup',{embed:async texts=>{inputs=texts;return texts.map(()=>[1,0])}});
  assert.equal(inputs.length,2);assert.ok(!JSON.stringify(inputs).includes('PRIVATE'));
});
await check('embedding HTTP is fixed, separately gated, validates dimensions and rejects redirects',async()=>{
  let requests=0;
  const fetcher=async(url,init)=>{requests++;assert.ok(url.endsWith('/compatible-mode/v1/embeddings'));assert.equal(init.redirect,'manual');const body=JSON.parse(init.body);assert.equal(body.model,EMBEDDING_MODEL);return Response.json({usage:{prompt_tokens:7},data:body.input.map((_,index)=>({index,embedding:Array(256).fill(1)}))})};
  await assert.rejects(()=>new QwenEmbedding('sk-synthetic-embedding',false,fetcher).embed(['input']),/EMBEDDING_NOT_CONFIGURED/);assert.equal(requests,0);
  const adapter=new QwenEmbedding('sk-synthetic-embedding',true,fetcher);assert.equal((await adapter.embed(['input']))[0].length,256);assert.equal(adapter.receipt.input_tokens,7);
  await assert.rejects(()=>new QwenEmbedding('sk-synthetic-embedding',true,async()=>new Response('',{status:302})).embed(['input']),/PROVIDER_REDIRECT_REJECTED/);
  await assert.rejects(()=>new QwenEmbedding('sk-synthetic-embedding',true,async()=>Response.json({data:[{index:0,embedding:[1]}]})).embed(['input']),/INVALID_EMBEDDING_RESPONSE/);
});
await check('a provisional final with tool calls is not accepted until tool results return',async()=>{
  const seen=[];let reserved=0;
  const loop=await runSingleRoleAgent({task,evidence:[evidence],since:null,allowFollowUp:true,budget,beforeModel:async()=>{reserved++},invoke:async next=>{seen.push(next);return seen.length===1?{final:{...raw,status:'ok'},toolCalls:[{name:'retrieve_project_evidence',arguments:{query:'configuration',id:''}}]}:{final:raw,toolCalls:[]}}});
  assert.equal(seen.length,2);assert.equal(reserved,1);assert.equal(loop.spend.extraModelCalls,1);assert.match(JSON.stringify(seen[1]),/应用工具回执/);assert.equal(loop.final,raw);
});
await check('public source bodies return to the model and final refs validate against that exact input',async()=>{
  const oldFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>String(url).includes('algolia')?Response.json({hits:[{objectID:'100'}]}):Response.json({id:100,type:'story',title:'Synthetic setup',by:'fixture',time:Math.floor(Date.now()/1000),text:quote});
  try{
    const loop=await runSingleRoleAgent({task:{...task,evidence_ids:[],evidence:[]},evidence:[],since:null,allowFollowUp:true,budget,invoke:async next=>{calls++;if(calls===1)return {final:null,toolCalls:[{name:'hacker_news_search',arguments:{query:'setup',id:''}}]};assert.ok(next.evidence_ids.includes('HN100'));assert.equal(next.evidence.find(e=>e.id==='HN100').text,quote);return {final:{...raw,data:{notes:[{claim:quote,refs:['HN100'],kind:'fact'}],citations:[{evidence_id:'HN100',quote}]},evidence_ids:['HN100']},toolCalls:[]}}});
    assert.doesNotThrow(()=>acceptAgentFinal(loop.final,loop.finalTask));
  }finally{globalThis.fetch=oldFetch;}
});
await check('changed run before a follow-up prevents the next model invocation',async()=>{
  let calls=0;
  await assert.rejects(()=>runSingleRoleAgent({task,evidence:[evidence],since:null,allowFollowUp:true,budget,beforeModel:async()=>{throw new Error('EXECUTION_INTERRUPTED')},invoke:async()=>{calls++;return {final:null,toolCalls:[{name:'retrieve_project_evidence',arguments:{query:'configuration',id:''}}]}}}),e=>e instanceof AgentStepFailure&&e.message==='EXECUTION_INTERRUPTED'&&e.spend.extraModelCalls===0);
  assert.equal(calls,1);
});
await check('completed real delivery creates one idempotent draft; simulation or failure creates none',()=>{
  const p=newProject();p.evidence=[evidence];
  const proposal={title:'Draft',problem:'Setup friction',audience:'Teams',alternative:'Existing tools',conclusion:'Conditional hypothesis',decision:'evidence',payment:'none',refs:['E1'],counter:'Not verified',unknowns:'Payment unknown',plan:'Review evidence'};
  const run={id:'RUN',revision:1,evidenceVersion:1,status:'completed',simulation:false,tasks:[{role:'coordinator',output:{data:{proposal}}}]};
  saveOpportunityDraft(p,{...run,status:'failed'});saveOpportunityDraft(p,{...run,simulation:true});assert.equal(p.opportunities.length,0);
  saveOpportunityDraft(p,run);saveOpportunityDraft(p,run);assert.equal(p.opportunities.length,1);assert.equal(p.opportunities[0].status,'draft');assert.equal(p.opportunities[0].sourceRunId,'RUN');
});
await check('real route persists both model receipts and budget reservations; duplicate advance cannot call again',async()=>{
  const oldFetch=globalThis.fetch;
  const p=newProject({title:'Synthetic tool cycle route',audience:'Teams',decision:'Offline checks'});p.confirmed=true;p.evidence=[evidence];await create(p);
  globalThis.__testEnv.DASHSCOPE_API_KEY='sk-synthetic-tool-route';globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED='true';
  const api=async(project,action,callId=crypto.randomUUID())=>{const response=await globalThis.__apiTestFetch('http://test.local/api/projects/'+project.id+'/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:project.version,callId,action,mode:'single',allowSupplement:true,freeTierOnlyConfirmed:true})});return {status:response.status,...await response.json()}};
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    assert.ok(String(url).endsWith('/chat/completions'));calls++;
    const next=JSON.parse(JSON.parse(init.body).messages[1].content);
    if(calls===2)assert.match(JSON.stringify(next),/应用工具回执/);
    const body={status:'ok',data:{notes:[{claim:'support workflow',refs:[],kind:'gap'}],framing:{target_user:'Teams',scenario:'Setup',questions:['What repeats?']}},evidence_ids:[],gaps:[],tool_calls:calls===1?[{name:'retrieve_project_evidence',arguments:{query:'configuration',id:''}}]:[]};
    return Response.json({usage:{prompt_tokens:calls===1?11:13,completion_tokens:5},choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]});
  };
  try{
    let state=await api(p,'start');assert.equal(state.status,200);const before=state.project,callId=crypto.randomUUID();state=await api(before,'advance',callId);
    assert.equal(state.status,200);assert.equal(state.project.workflow.status,'ready');assert.equal(calls,2);assert.equal(state.project.workflow.budget.modelAttempts,2);assert.equal(state.project.budget.modelCalls,2);
    const record=state.project.workflow.records[0];assert.equal(record.agentModelReceipts.length,2);assert.deepEqual(record.usage,{input_tokens:24,output_tokens:10});
    assert.equal((await api(before,'advance',callId)).status,200);assert.equal(calls,2);
  }finally{globalThis.fetch=oldFetch;delete globalThis.__testEnv.DASHSCOPE_API_KEY;delete globalThis.__testEnv.QWEN_FREE_TIER_ONLY_CONFIRMED;const live=await get(p.id);await globalThis.__apiTestFetch('http://test.local/api/projects/'+p.id+'?version='+live.version,{method:'DELETE'});}
});
await check('automatic draft blocks project completion until explicit manual save confirms it',async()=>{
  const p=newProject({title:'Synthetic draft confirmation'});p.confirmed=true;p.evidence=[evidence];p.opportunities=[{id:'draft:R',title:'Draft',problem:'Problem',audience:'Teams',alternative:'Tools',conclusion:'Hypothesis',decision:'evidence',payment:'none',refs:['E1'],counter:'Unknown',unknowns:'Unknown',plan:'Verify original',stale:false,revision:1,status:'draft',sourceRunId:'R',sourceEvidenceVersion:1}];await create(p);
  const patch=async(project,action,data)=>{const response=await globalThis.__apiTestFetch('http://test.local/api/projects/'+p.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:project.version,callId:crypto.randomUUID(),action,data})});return {status:response.status,...await response.json()}};
  try{
    assert.equal((await patch(p,'finish')).status,400);
    const confirmed=await patch(p,'opportunity',p.opportunities[0]);assert.equal(confirmed.status,200);assert.equal(confirmed.project.opportunities[0].status,'confirmed');assert.equal(confirmed.project.opportunities[0].sourceRunId,'R');
    assert.equal((await patch(confirmed.project,'finish')).status,200);
  }finally{const live=await get(p.id);await globalThis.__apiTestFetch('http://test.local/api/projects/'+p.id+'?version='+live.version,{method:'DELETE'});}
});
console.log(JSON.stringify({capability_gap_checks:passed,actual_model_calls:0,actual_embedding_calls:0,scope:'synthetic vectors and provider HTTP; not live semantic quality or real tool-loop validation'}));
