import {renderQuoteLayers} from '../lib/research/draft-cards.ts';
import assert from 'node:assert/strict';
import {validationPlanWarnings,evidenceUseHint,evidenceQualitySummary,evidenceQualityReport,QUALITY_POLICY_VERSION} from '../lib/research/evidence-quality.ts';
import {workflowModelUsage} from '../lib/research/workflow-usage.ts';
import {workflowReport,makeWorkflow} from '../lib/research/workflow.ts';
import {fixtureProject} from '../lib/research/evaluation.ts';
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name)}
const dev={id:'DEV',title:'[P5-09] Complete SaaS UX',text:'## Required scenarios\n- onboarding resume\n## Acceptance criteria\nTests cover critical paths.'};
const promo={id:'PROMO',title:'Show HN: SaaS docs',text:'We built a unified documentation workspace.'};
check('development tasks and marketing are indirect hints, not verified customer evidence',()=>{assert.equal(evidenceUseHint(dev).label,'开发任务或提交说明');assert.equal(evidenceUseHint(promo).label,'产品展示或推广线索');assert.equal(evidenceQualitySummary([dev,promo]).allIndirect,true)});
check('unmatched first person and payment statements stay unverified',()=>{for(const text of ['I spend two hours handing projects over.','I paid $100 for this tool.','客户说想购买。'])assert.equal(evidenceUseHint({id:'X',title:'User discussion',text}).label,'资料用途待人工核查');assert.equal(evidenceQualitySummary([]).allIndirect,false);assert.equal(evidenceUseHint({id:'W',title:'SaaS',text:'Background',source:'中文维基百科'}).label,'背景或统计资料')});
check('hints preserve source contents and flag related tasks without counting customers',()=>{const before=JSON.stringify(dev);assert.ok(evidenceQualityReport([dev,{...dev,id:'DEV2'}]).includes('非语义质量评分'));assert.equal(JSON.stringify(dev),before)});
check('report and UI use per-call receipts, excluding local preparation failures',()=>{
 const p=fixtureProject('baseline');p.mode='manual';p.evidence=p.evidence.map(e=>({...e,kind:'imported'}));const w=makeWorkflow(p,false);w.budget.modelAttempts=3;
 w.records=[{id:'plan',kind:'model',stage:'plan',agentModelReceipts:[{usage:{input_tokens:10,output_tokens:2}},{usage:{input_tokens:20,output_tokens:3}}],usage:{input_tokens:30,output_tokens:5}},{id:'local',kind:'local',stage:'analyze',preparation:true},{id:'analysis',kind:'model',stage:'analyze',usage:{input_tokens:40,output_tokens:7}}];
 const usage=workflowModelUsage(w),report=workflowReport(p,w);assert.equal(usage.receipts,3);assert.equal(usage.input,70);assert.equal(usage.output,12);assert.ok(report.includes('有用量回执 3 次；输入 / 输出词元 70 / 12'));assert.equal(usage.unknown,0);
 w.budget.modelAttempts=4;assert.equal(workflowModelUsage(w).unknown,1);
});
check('report distinguishes document capabilities and issue experience without verifying either',()=>{assert.equal(evidenceUseHint({id:'D',title:'Knowledge Retrieval',text:'Feature',source:'GitHub 文档 · 原始文件'}).label,'功能文档或产品说明');assert.equal(evidenceUseHint({id:'I',title:'Citation missing',text:'Expected behavior: sources visible',source:'GitHub Issue'}).label,'公开问题或需求线索');assert.equal(evidenceQualitySummary([{id:'I',title:'Bug Report',text:'Steps to reproduce',source:'GitHub Issue'}]).allIndirect,false)});
check('missing gap notes cannot hide explicit proposal unknowns',()=>{const text=renderQuoteLayers([],[],[],'未知频率与付费意愿');assert.ok(text.includes('模型未在 notes 中单列未知主张'));assert.ok(text.includes('未知频率与付费意愿'));assert.ok(!text.includes('## 未知\n未知只收录'))});
check('validation plan warnings identify missing explicit checks without changing plans',()=>{const plan='访谈3位开发者，了解问题';assert.equal(validationPlanWarnings(plan).length,2);assert.equal(validationPlanWarnings('观察指标：记录失败次数。停止条件：没有可复现问题则停止。').length,0);assert.equal(plan,'访谈3位开发者，了解问题')});
console.log(JSON.stringify({evidence_boundary_checks:passed,actual_model_calls:0,policy:QUALITY_POLICY_VERSION}));
