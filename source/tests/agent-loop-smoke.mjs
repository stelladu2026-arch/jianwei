// Offline agent tool loop. The model is scripted. No live provider call.
import assert from 'node:assert/strict';
import {acceptAgentFinal,assertLiteralCitations,retrieveProjectEvidence,runSingleRoleAgent} from '../lib/research/agent-loop.ts';
import {validateResult} from '../lib/research/execution.ts';
import {classifyPublicRemark,paymentJudgment,renderDemandCard,renderInterviewPlan,renderPublicSignals,renderQuoteLayers} from '../lib/research/draft-cards.ts';
import {scopeChangeReason} from '../lib/research/domain.ts';
let passed=0;
const beforeFetch=globalThis.fetch;
function check(label,fn){return Promise.resolve(fn()).then(()=>{passed++;console.log('PASS '+label);});}
function evidence(id,text,over={}){return {id,title:id,text,source:'Hacker News',date:'2026-10-01',fetched:'2026-10-06T00:00:00.000Z',author:'a',thread:id,url:'',kind:'public',stance:'context',excluded:false,truncated:false,...over};}
const alphaText='alpha-marker repeated setup questions in this project corpus for retrieval overlap testing.';
const betaText='beta-marker belongs to another project and must stay out of the current context.';
const task={project_id:'project-a',run_id:'run-a',revision:1,call_id:'call-a',role:'needs',purpose:'search_plan',brief:{title:'Synthetic'},evidence_ids:[],evidence:[],context:{rules:[],memories:[],prior_results:[],simulation:true,attempt:1,scenario:'normal'}};
const budget=(over={})=>({modelLimit:2,modelAttempts:1,sourceLimit:10,sourceAttempts:0,searchLimit:3,searches:0,paidBudget:0,...over});
const framing={target_user:'Independent software teams',scenario:'Repeated setup questions',questions:['Which setup steps are repeated?']};
const finalBody={status:'ok',data:{notes:[{claim:'support workflow',refs:[],kind:'gap'}],framing},evidence_ids:[],gaps:['Synthetic gap'],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'synthetic-agent'};
function tool(name,query,id=''){return {name,arguments:{query,id}};}
let fetches=[];
globalThis.fetch=async(url,init={})=>{
  const address=String(url);fetches.push(address);
  assert.equal(init.redirect,'manual');
  assert.ok(address.startsWith('https://hn.algolia.com/api/v1/search?')||address.startsWith('https://hacker-news.firebaseio.com/v0/item/')||address.startsWith('https://zh.wikipedia.org/w/api.php?'));
  if(address.includes('hn.algolia.com'))return Response.json({hits:[{objectID:'100'}]});
  if(address.includes('hacker-news.firebaseio.com'))return Response.json({id:100,type:'story',by:'fixture-author',time:Math.floor(Date.now()/1000)-3600,title:'Synthetic agent source',text:'Synthetic agent source body is long enough to be usable evidence and is not a market fact.'});
  const parsed=new URL(address);
  if(parsed.searchParams.get('list')==='search')return Response.json({query:{search:[{pageid:1001,title:'Synthetic agent encyclopedia'}]}});
  return Response.json({query:{pages:[{pageid:1001,title:'Synthetic agent encyclopedia',extract:'Synthetic encyclopedia extract is long enough to be usable and is not a domestic user interview.',revisions:[{user:'fixture-editor',timestamp:new Date().toISOString()}]}]}});
};
try{
  await check('allowlisted search runs and a second search stops when the source cap is spent',async()=>{
    fetches=[];
    const result=await runSingleRoleAgent({task,evidence:[],since:null,allowFollowUp:false,budget:budget(),invoke:async()=>({final:finalBody,toolCalls:[tool('hacker_news_search','support workflow'),tool('hacker_news_search','support alternatives')]})});
    assert.equal(result.runtime,'@langchain/langgraph');
    assert.equal(result.spend.trace[0].status,'executed');
    assert.equal(result.spend.trace[1].status,'refused');
    assert.equal(result.spend.trace[1].reason,'SOURCE_BUDGET');
    assert.equal(fetches.filter(url=>url.includes('hn.algolia.com')).length,1);
    assert.ok(result.spend.collections[0].usableIds.includes('HN100'));
    assert.equal(result.spend.extraModelCalls,0);
  });
  await check('payment, bill, interview and geographic gaps do not search',async()=>{
    fetches=[];
    const queries=['payment invoices','unpaid bills','customer interview','geographic representativeness','付款意愿','真实账单','用户访谈','地域代表性'];
    for(const query of queries){
      const result=await runSingleRoleAgent({task,evidence:[],since:null,allowFollowUp:false,budget:budget(),invoke:async()=>({final:finalBody,toolCalls:[tool('hacker_news_search',query),tool('zh_wikipedia_extract',query)]})});
      assert.ok(result.spend.trace.every(row=>row.status==='refused'&&row.reason==='UNSEARCHABLE'));
    }
    assert.equal(fetches.length,0);
  });
  await check('a quote that is not a literal slice is rejected and a real slice is kept',async()=>{
    const text='Synthetic fixture body that is long enough to locate as a literal slice.';
    const slice='long enough to locate';
    assert.throws(()=>assertLiteralCitations([{evidence_id:'E1',quote:'this quote was never in the source'}],[{id:'E1',text}]),/INVALID_EVIDENCE_QUOTE/);
    assert.doesNotThrow(()=>assertLiteralCitations([{evidence_id:'E1',quote:slice}],[{id:'E1',text}]));
    const proposal={title:'Draft',problem:'Friction',audience:'Teams',alternative:'Mail',conclusion:'Conditional',decision:'evidence',payment:'none',refs:['E1'],counter:'Counter',unknowns:'Unknown',plan:'Read the original before interviews'};
    const quoted={...task,role:'coordinator',evidence_ids:['E1'],evidence:[{id:'E1',text}]};
    const bad={status:'partial',data:{notes:[{claim:'A hypothesis only.',refs:['E1'],kind:'hypothesis'}],citations:[{evidence_id:'E1',quote:'this quote was never in the source'}],proposal},evidence_ids:['E1'],gaps:['Gap'],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'synthetic-agent'};
    let issue;assert.throws(()=>acceptAgentFinal(bad,quoted,items=>{issue=items[0];}),/INVALID_EVIDENCE_QUOTE/);
    assert.equal(issue,'data.citations.0.quote:not_in_input');
    const good={...bad,data:{...bad.data,citations:[{evidence_id:'E1',quote:slice}]}};
    assert.equal(acceptAgentFinal(good,quoted).data.citations[0].quote,slice);
  });
  await check('retrieval context comes only from the current project corpus',async()=>{
    const alpha=evidence('A1',alphaText),beta=evidence('B1','alpha-marker '+betaText);
    const direct=retrieveProjectEvidence([alpha],'alpha-marker setup');
    assert.deepEqual(direct.map(hit=>hit.id),['A1']);
    assert.ok(!JSON.stringify(direct).includes('beta-marker'));
    const seen=[];
    const result=await runSingleRoleAgent({task,evidence:[alpha],since:null,allowFollowUp:true,budget:budget({modelAttempts:0,modelLimit:4,sourceLimit:10}),invoke:async next=>{seen.push(next);return seen.length===1?{final:null,toolCalls:[tool('retrieve_project_evidence','alpha-marker setup')]}:{final:finalBody,toolCalls:[]};}});
    assert.equal(seen.length,2);
    assert.ok(JSON.stringify(seen[1].context.rules).includes('alpha-marker'));
    assert.ok(JSON.stringify(seen[1]).includes('词面重叠'));
    assert.ok(!JSON.stringify(seen[1]).includes('beta-marker'));
    assert.equal(result.spend.extraModelCalls,1);
    assert.equal(result.spend.sourceAttempts,0);
  });
  await check('a follow-up model call is refused when the model cap is already spent',async()=>{
    let calls=0;
    const result=await runSingleRoleAgent({task,evidence:[evidence('A1',alphaText)],since:null,allowFollowUp:true,budget:budget({modelAttempts:1,modelLimit:1}),invoke:async()=>{calls++;return {final:null,toolCalls:[tool('retrieve_project_evidence','alpha-marker')]};}});
    assert.equal(calls,1);
    assert.ok(result.spend.trace.some(row=>row.reason==='MODEL_BUDGET'));
    assert.equal(result.final,null);
  });
  await check('an unknown tool and a fact label are refused without a search',async()=>{
    fetches=[];
    const result=await runSingleRoleAgent({task,evidence:[],since:null,allowFollowUp:false,budget:budget(),invoke:async()=>({final:finalBody,toolCalls:[tool('shell','ls')]})});
    assert.equal(result.spend.trace[0].reason,'TOOL_NOT_ALLOWLISTED');
    assert.equal(fetches.length,0);
    assert.throws(()=>validateResult({status:'ok',data:{notes:[{claim:'customer support',refs:[],kind:'事实'}]},evidence_ids:[],gaps:[],errors:[],revision:1,usage:{input_tokens:0,output_tokens:0},model:'synthetic-agent'},task),/INVALID_MODEL_OUTPUT/);
    assert.throws(()=>validateResult({status:'ok',data:{notes:[{claim:'customer support',refs:[],kind:'观察'}]},evidence_ids:[],gaps:[],errors:[],revision:1,usage:{input_tokens:0,output_tokens:0},model:'synthetic-agent'},task),/INVALID_MODEL_OUTPUT/);
  });
  await check('demand card and interview plan keep missing fields and point at term overlap',async()=>{
    const corpus=[evidence('E1',alphaText)];
    const card=renderDemandCard({problem:'repeated setup questions',who_refs:['E1']},corpus);
    assert.match(card,/## 需求卡/);
    assert.match(card,/### 谁\n未提供/);
    assert.match(card,/### 影响\n未提供/);
    assert.match(card,/### 当前变通\n未提供/);
    assert.match(card,/### 问题\nrepeated setup questions \[E1\]/);
    assert.match(card,/不是语义检索/);
    assert.doesNotMatch(card,/自动保存机会卡已|访谈记录：/);
    const interview=renderInterviewPlan({questions:[{question:'Who repeats setup?',evidence_ids:['E1']}]},corpus);
    assert.match(interview,/1\. Who repeats setup\? \[E1\]/);
    assert.match(interview,/会改变决策的证据：未提供/);
    const missing=renderInterviewPlan(undefined,corpus);
    assert.match(missing,/没有编造访谈/);
    assert.match(missing,/会改变决策的证据：未提供/);
    assert.doesNotMatch(missing,/市场结论是/);
    const quoted={...task,role:'coordinator',evidence_ids:['E1'],evidence:[{id:'E1',text:alphaText}]};
    const proposal={title:'Draft',problem:'Friction',audience:'Teams',alternative:'Mail',conclusion:'Conditional',decision:'evidence',payment:'none',refs:['E1'],counter:'Counter',unknowns:'Unknown',plan:'Read the original'};
    const foreign={status:'partial',data:{notes:[{claim:'A hypothesis only.',refs:['E1'],kind:'hypothesis'}],proposal:{...proposal,demand:{problem_refs:['FOREIGN']}}},evidence_ids:['E1'],gaps:['Gap'],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'synthetic-agent'};
    assert.throws(()=>validateResult(foreign,quoted),/INVALID_MODEL_REFERENCE/);
  });
  await check('public remarks stay complaints, verbal interest, or no payment',async()=>{
    assert.equal(classifyPublicRemark('This is frustrating and painful.'), '抱怨');
    assert.equal(classifyPublicRemark('I would pay if it were cheaper.'), '口头兴趣');
    assert.equal(classifyPublicRemark('I paid $20 last month for the tool.'), '未见付款');
    assert.equal(paymentJudgment('medium',['This is frustrating and painful.']), '未见付款');
    assert.equal(paymentJudgment('none',['I would pay if it were cheaper.']), '未见付款');
    assert.equal(paymentJudgment('weak',['I would pay if it were cheaper.']), '口头兴趣');
    assert.equal(paymentJudgment('medium',['I paid $20 last month for the tool.']), '未见付款');
    const shown=renderPublicSignals([{evidence_id:'E1',quote:'I paid $20 last month for the tool.',located:true}],'medium');
    assert.match(shown,/付款判断：未见付款/);
    assert.match(shown,/不能升级为实际付费/);
    assert.doesNotMatch(shown,/付款判断：实际付费/);
    const text='Synthetic fixture body that is long enough to locate as a literal slice.';
    const layers=renderQuoteLayers([{claim:'A hypothesis only.',refs:['E1'],kind:'hypothesis'},{claim:'Payment is unknown.',refs:[],kind:'gap'}],[{evidence_id:'E1',quote:'long enough to locate'}],[{id:'E1',text}]);
    assert.match(layers,/## 来源原句/);
    assert.match(layers,/long enough to locate/);
    assert.match(layers,/不是已核实的市场事实/);
    assert.match(layers,/## 推断\n推断只收录 kind 为 hypothesis 的主张。\n- A hypothesis only\. \[E1\]/);
    assert.match(layers,/## 未知/);
    assert.match(layers,/Payment is unknown/);
    assert.equal(scopeChangeReason({audience:'A',region:'R',decision:'D'},{audience:'B',region:'R',decision:'D'}),'目标人群已变更，较早完成的结论待复核。原文未改写，也未标成否定。');
    assert.equal(scopeChangeReason({audience:'A',region:'R',decision:'D'},{audience:'A',region:'R',decision:'D'}),'');
  });
  console.log(JSON.stringify({agent_loop_checks:passed,actual_model_calls:0,scope:'scripted model, allowlisted tools, current-project term overlap; not a live four-role completion or a market conclusion'}));
}finally{globalThis.fetch=beforeFetch;}
