import assert from 'node:assert/strict';
import {developmentArtifact,sourceFit} from '../lib/research/source-fit.ts';
import {existingAnalysisSources} from '../lib/research/workflow.ts';
import {newProject} from '../lib/research/domain.ts';
import {evidenceUseHint,validationPlanWarnings} from '../lib/research/evidence-quality.ts';
import {sourceProfile,focusedSourceQuery} from '../lib/research/research-channels.ts';
import {bindAlternativeSchema,decodeAlternativeSelection,ALTERNATIVE_FORMAT,UNKNOWN_ALTERNATIVE} from '../lib/research/alternative-selection.ts';
import {singleCitationResponseSchema,QwenModel,quoteChoices} from '../lib/research/qwen-model.ts';
import {sourceQuoteCatalog} from '../lib/research/source-facts.ts';
import {providerSchemaIssues} from '../lib/research/qwen-schema.ts';
const base={id:'E1',title:'Freelance client invoice becomes overdue',text:'As a freelance contractor I track client project invoices in a spreadsheet. I lose time checking which client invoice is overdue each week.',kind:'public',source:'GitHub Issues',url:'https://github.com/fixture/invoice-tool/issues/1',excluded:false,contentBasis:'full',stance:'context',truncated:false,date:'2026-10-01',fetched:'',author:'fixture',thread:'1'};
const scope={title:'小型外包团队的回款与发票跟进',audience:'软件外包团队负责人'};
const unrelated=[{title:'Tenant key usage history',text:'The operator needs credential attribution and model token accounting. ## Sketch, not a design\nBuild an aggregate report.'},{title:'cornerShape follow-up',text:'## Status\nready-for-agent\n## What to build\nFinish shared radius styles on invoice rows.'},{title:'feat(invoicing): invoice data foundations',text:'Read events/models/invoice.py before the schema migration; needs-design.'},{title:'Feature: Proforma invoices',text:'International trade needs proforma invoice support. ## Proposed steps\nAdd document types and a backend migration.'},{title:'Optional service metrics',text:'## Superseding owner direction\nThe owner instructed implementation of analytics and invoice reconciliation.'}].map((e,i)=>({...base,...e,id:'X'+i,url:'https://github.com/fixture/other/issues/'+i}));
assert.ok(unrelated.every(e=>!sourceFit(e,scope).allowed));assert.equal(sourceFit(base,scope).allowed,true);
assert.ok(unrelated.filter(e=>developmentArtifact(e.title,e.text)).every(e=>evidenceUseHint(e).label==='开发任务或提交说明'));
const p=newProject(scope);p.evidence=[base,...unrelated];const saved=JSON.stringify(p.evidence);assert.deepEqual(existingAnalysisSources(p).map(e=>e.id),['E1']);assert.equal(JSON.stringify(p.evidence),saved);
assert.equal(sourceProfile('invoice follow-up gaps',scope.title),'receivables');assert.equal(focusedSourceQuery('invoice follow-up gaps','receivables'),'agency invoice');
const plan='联系3-5位团队负责人。若超过半数受访者表示愿意付费，则继续，否则暂停。';const warnings=validationPlanWarnings(plan);assert.ok(!warnings.some(w=>w.includes('未显式说明观察指标')));assert.ok(warnings.some(w=>w.includes('口头')));
assert.ok(!validationPlanWarnings(plan+' 记录近期真实案例、耗时和试用行为。').some(w=>w.includes('口头')));
const catalog=sourceQuoteCatalog([base],quoteChoices,['E1']);const schema=bindAlternativeSchema(singleCitationResponseSchema('coordinator',['E1'],[base],false),catalog);assert.deepEqual(providerSchemaIssues(schema),[]);assert.equal(schema.properties.data.properties.proposal.properties.alternative,undefined);
const raw={alternative_format:ALTERNATIVE_FORMAT,data:{proposal:{alternative_quote_id:UNKNOWN_ALTERNATIVE,refs:[]}},evidence_ids:[]};const unknown=decodeAlternativeSelection(raw,catalog);assert.equal(unknown.value.data.proposal.alternative,'本轮未取得目标人群现有替代方案的直接证据。');assert.ok(raw.data.proposal.alternative_quote_id);
const quote=decodeAlternativeSelection({...raw,data:{proposal:{alternative_quote_id:catalog[0].id,refs:[]}}},catalog);assert.ok(quote.value.data.proposal.alternative.includes(catalog[0].quote));assert.deepEqual(quote.value.data.proposal.refs,['E1']);assert.throws(()=>decodeAlternativeSelection({...raw,data:{proposal:{alternative_quote_id:'FOREIGN'}}},catalog),/INVALID_MODEL_REFERENCE/);assert.throws(()=>decodeAlternativeSelection({...raw,data:{proposal:{alternative_quote_id:UNKNOWN_ALTERNATIVE,alternative:'unsupported'}}},catalog),/INVALID_MODEL_OUTPUT/);
const legacy={data:{proposal:{alternative:'Legacy unverified claim'}}};assert.equal(decodeAlternativeSelection(legacy,catalog).value,legacy);
let requests=0;const adapter=new QwenModel('sk-offline-fixture-only',async(_url,init)=>{requests++;const body=JSON.parse(init.body);assert.ok(body.response_format.json_schema.schema.required.includes('alternative_format'));return Response.json({usage:{prompt_tokens:200,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify({proposal_basis_format:'proposal-basis/1',citation_format:'citation-selections/1',alternative_format:ALTERNATIVE_FORMAT,status:'partial',data:{notes:[{claim:'Only a fixture, no verified demand.',kind:'gap',refs:['E1']}],citation_quote_ids:[],proposal:{title:'Fixture',problem:'Unknown',audience:'Fixture',basis_quote_ids:{problem:[],conclusion:[],counter:[]},alternative_quote_id:UNKNOWN_ALTERNATIVE,conclusion:'More evidence needed.',decision:'evidence',payment:'none',refs:['E1'],counter:'Unknown',unknowns:'Unknown',plan:'Record real cases before continuing.',demand:{}}},evidence_ids:['E1'],gaps:['Fixture']})}}]});});
const result=await adapter.execute({project_id:'fixture',run_id:'fixture',revision:1,call_id:'fixture',role:'coordinator',brief:scope,evidence:[base],evidence_ids:['E1'],allow_tools:false},new AbortController().signal);assert.equal(requests,1);assert.ok(adapter.receipt.normalizations.includes('alternative_unknown_preserved'));assert.equal(result.data.proposal.alternative,unknown.value.data.proposal.alternative);
console.log('PASS source relevance and quote-bound alternatives: task exclusion, scoped query, metric warning and real adapter with synthetic HTTP; actual external requests 0');

const assessment={judgment:'insufficient',reason_code:'missing_evidence',quote_ids:[]};
const reviewWire={review_format:'claim-selections/2',fact_format:'source-quote/1',alternative_format:ALTERNATIVE_FORMAT,status:'partial',data:{notes:[{claim:'Unknown fixture.',kind:'gap',check:assessment}],proposal:{title:'Fixture',problem:'Unknown',audience:'Fixture',alternative_quote_id:catalog[0].id,conclusion:'More evidence needed.',decision:'evidence',payment:'none',counter:'Unknown',unknowns:'Unknown',plan:'Record real cases.',problem_check:assessment,conclusion_check:assessment},disagreements:[]},gaps:['Fixture']};
const reviewAdapter=new QwenModel('sk-offline-fixture-only',async()=>Response.json({usage:{prompt_tokens:200,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify(reviewWire)}}]}));
const reviewed=await reviewAdapter.execute({project_id:'fixture',run_id:'fixture',revision:1,call_id:'fixture',role:'coordinator',review:true,brief:scope,evidence:[base],evidence_ids:['E1'],allow_tools:false},new AbortController().signal);
assert.deepEqual(reviewed.data.proposal.refs,['E1']);assert.deepEqual(reviewed.evidence_ids,['E1']);assert.ok(reviewed.data.proposal.alternative.includes(catalog[0].quote));
console.log('PASS four-role selected alternative expands only its original quote and generated reference; external requests 0');

import {makeWorkflow,workflowReport,tagCollectionReceipts} from '../lib/research/workflow.ts';
p.confirmed=true;p.workflow=makeWorkflow(p,false);p.workflow.records=[{id:'fixture',kind:'source',stage:'collect',state:'done',collection:{query:'fixture',added:0,duplicate:0,titleOnly:0,failed:0,sourceDetails:[{source:'Fixture channel',state:'empty',requests:1,items:0,full:0,excerpts:0}]}}];
assert.ok(workflowReport(p,p.workflow).includes('渠道回执：Fixture channel；未命中；请求 1 次；正文 0 / 摘要 0。'));
console.log('PASS export includes source execution and empty-result receipts without claiming evidence');

assert.equal(focusedSourceQuery('invoice overdue','receivables','自由职业译者发票跟进'),'freelance invoice overdue');
assert.equal(focusedSourceQuery('freelance invoice creation','receivables','自由职业译者发票跟进'),'freelance invoice creation');
const unbound=new QwenModel('sk-offline-fixture-only',async()=>Response.json({usage:{prompt_tokens:100,completion_tokens:30},choices:[{finish_reason:'stop',message:{content:JSON.stringify({status:'partial',data:{proposal:{alternative:'All teams use spreadsheets.'}}})}}]}));
await assert.rejects(()=>unbound.execute({project_id:'fixture',run_id:'fixture',revision:1,call_id:'fixture',role:'coordinator',brief:scope,evidence:[base],evidence_ids:['E1']},new AbortController().signal),/INVALID_MODEL_OUTPUT/);
console.log('PASS live response cannot use legacy alternative compatibility; scoped focus preserves actor and concrete action');

const implementation=[{title:'EPIC-021: Freelance invoices',text:'## Scope\nInvoice data layer and overdue reminders.\n## Done when\n- [ ] Marking paid creates an entry.'},{title:'Phase 4: Revenue dashboard',text:'Give freelancers invoice totals.\n## Tasks\n- [ ] Use database aggregation.\n- [ ] Unit tests\n## Done when\nTotals are correct.'}];
const ui='Freelancer Invoice Tracker\nTotal Invoiced\nTotal Paid\nPending\nOverdue\nAdd Invoice\nInvoice #\nClient\nAmount\nDue Date\nStatus\nAction';
const layouts=[ui,ui.split('\n').map(s=>'> '+s).join('\n')];
for(const item of implementation){assert.equal(sourceFit({...base,...item},scope).allowed,false);assert.equal(evidenceUseHint(item).label,'开发任务或提交说明');}
for(const text of layouts){const item={...base,title:'Comment · Freelancer invoice tracker',text};assert.equal(sourceFit(item,scope).allowed,false);assert.equal(evidenceUseHint(item).label,'界面字段或引用副本');}
assert.equal(sourceFit({...base,text:ui+'\nI used this tracker but cannot save my invoice.'},scope).allowed,true);
for(const title of ['[TOOL] Invoice queue','For sale: Invoice recovery pack — €29','Show HN: Invoice reminders']){assert.equal(evidenceUseHint({...base,title}).label,'产品展示或推广线索');assert.equal(sourceFit({...base,title},scope).allowed,true);}
assert.ok(!validationPlanWarnings('访谈5名用户，询问耗时。若手动跟进耗时超过30分钟/月则继续，否则停止。').some(x=>x.includes('未显式说明观察指标')));
p.workflow.records[0].collection.sourceDetails[0]={source:'Fixture channel',state:'empty',requests:1,items:0,full:0,excerpts:0,query:'original actor query',effectiveQuery:'freelance invoice',batch:2};
const tagged=workflowReport(p,p.workflow);assert.ok(tagged.includes('采集 2；查询：original actor query；渠道聚焦词：freelance invoice'));
console.log('PASS task/UI admission, quoted layout exclusion, supply classification, time metric and per-tool query receipts');

const collections=['one','two'].map(query=>({query,routing:{profile:'receivables',effectiveQuery:query+' focused'},sourceDetails:[{source:'fixture',state:'empty',requests:1,items:0,full:0,excerpts:0}]}));
const beforeReceipts=JSON.stringify(collections),taggedReceipts=tagCollectionReceipts(collections);
assert.deepEqual(taggedReceipts.map(r=>[r.batch,r.query,r.effectiveQuery]),[[1,'one','one focused'],[2,'two','two focused']]);assert.equal(JSON.stringify(collections),beforeReceipts);
