import {checkAssessmentLabel} from './review-contract';
import type {Project,Evidence} from './domain';
import type {ModelTask,ModelResult,Role} from './model-port';
import {validateResult,errorLabels,type Analysis,type Run} from './execution';
import {assertLiteralCitations} from './evidence-citations';
import {locateChecks,type LocatedCheck} from './collaboration';
import {workflowStages,workflowRetryBlockReason,workflowAdvanceBlockReason,type ResearchWorkflow} from './workflow';
import {runRetryBlockReason} from './execution-controls';
import {roleNames} from './governance';
import {sourceCoverage} from './source-coverage';
import {claimKindLabels} from './claim-kinds';
import {judgmentLabels} from './review-contract';
export type OutcomeSource={key:string;id:string;title:string;text:string;source:string;date:string;kind:Evidence['kind'];truncated:boolean;origin:'input'|'project';current:boolean};
export type OutcomeGroup={id:string;stage:string;label:string;role:Role;data:Analysis;checks:LocatedCheck[];gaps:string[];sourceKeys:string[]};
export type StageOutcome={id:string;title:string;scopeTitle:string;status:string;revision:number;evidenceVersion:number;historical:boolean;simulation:boolean;researchComplete:boolean;summary:string;failure:string;groups:OutcomeGroup[];sources:OutcomeSource[];completed:string[];missing:string[];limitations:string[];next:string[];withheld:number;budget:{attempts:number;limit:number;auditAttempts?:number;receipts:number;input:number;output:number;unknown:number};report:string};
const unresolved=new Set(['ready','running','failed','partial','paused','cancelled','stale']);
const clean=(text:string)=>text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]{}#])/g,'\\$1');
function quoted(text:string){return clean(text).split('\n').map(line=>'> '+line).join('\n');}
function sourceBuilder(p:Project){
 const sources:OutcomeSource[]=[];
 function add(item:Partial<Evidence>&{id:string;text:string},origin:OutcomeSource['origin']){
  const existing=sources.find(e=>e.id===item.id&&e.text===item.text);if(existing)return existing.key;
  const live=p.evidence.find(e=>e.id===item.id),matches=!!live&&!live.excluded&&live.text.startsWith(item.text);
  const source:OutcomeSource={key:'source:'+sources.length,id:item.id,title:item.title||'输入原文',text:item.text,source:item.source||(matches?live!.source:'快照未保存来源名称'),date:item.date||(matches?live!.date:'未知'),kind:item.kind||(matches?live!.kind:'imported'),truncated:!!item.truncated,origin,current:matches};sources.push(source);return source.key;
 }
 return {sources,add};
}
function acceptedGroup(id:string,stage:string,label:string,input:ModelTask|undefined,output:ModelResult|undefined,add:ReturnType<typeof sourceBuilder>['add']):OutcomeGroup|undefined{
 if(!input||!output||input.purpose)return;
 const result=validateResult(output,input);if(input.role!=='coordinator'&&result.data.proposal)throw new Error('INVALID_REVIEW_COVERAGE');assertLiteralCitations(result.data.citations,input.evidence as Evidence[]);
 const checks=input.review?locateChecks(result,input):[];
 const sourceKeys=(input.evidence as Evidence[]).map(e=>add(e,'input'));
 return {id,stage,label,role:input.role,data:result.data,checks,gaps:result.gaps,sourceKeys};
}
// Read-only presentation: completed results are checked against their own saved
// inputs again. Never borrow today's originals to support a historical claim.
export function completedRunSummary(p:Project,r:Run){
 const builder=sourceBuilder(p),groups:OutcomeGroup[]=[];let withheld=0;
 for(const t of r.tasks){if(t.status!=='done'||!t.role)continue;try{const group=acceptedGroup(t.id,t.id,t.label,t.inputSnapshot,t.output,builder.add);if(group)groups.push(group);else withheld++;}catch{withheld++;}}
 const group=[...groups].reverse().find(g=>g.data.proposal);
 return {group,groups,sources:builder.sources,withheld,historical:r.revision!==p.revision||r.evidenceVersion!==(p.evidenceVersion||0)||r.status==='stale'||!!r.conclusionReview};
}
function meaning(groups:OutcomeGroup[],sources:OutcomeSource[],researchComplete:boolean,historical:boolean,simulation:boolean){
 if(historical)return '这是旧输入下已有成果，仅供追溯，不能作为当前范围的研究结论。';
 if(simulation)return '这是模拟流程成果，不构成真实用户研究或市场结论。';
 if(researchComplete)return '原研究草稿已完成；第二轮复核未完成，不抹去原草稿，也不表示复核通过。';
 if(groups.some(g=>g.data.proposal))return '已有候选机会判断；后续核查或保存尚未完成，只作为待人工核查的阶段草稿。';
 if(groups.length)return '已有阶段分析和待核查主张，尚未形成完整机会判断。';
 if(sources.length)return '已有资料可供核查；分析尚未完成，不能据此判断机会存在或不存在。';
 return '本轮尚无可交付原文或分析结论。保留研究问题与停止原因，先补充有来源的资料。';
}
function commonNext(outcome:Pick<StageOutcome,'historical'|'simulation'|'sources'|'groups'|'researchComplete'>){
 const next=['先核对所附原文与适用人群；阶段分析通过结构检查不等于商业判断已证实。'];
 if(outcome.historical)next.push('核对当前范围及有效资料后，明确新轮预算再重新研究；旧引用仅在历史输入快照中展示。');
 if(outcome.simulation)next.push('这些内容仅用于流程演示；真实验收需另行确认模型、额度与输入。');
 if(!outcome.sources.length)next.push('导入有来源且有权使用的访谈或讨论正文，或调整可检索的问题；没有搜到不代表没有需求。');
 if(outcome.groups.some(g=>g.data.notes.some(n=>n.kind==='gap')||g.gaps.length||g.data.proposal?.decision==='evidence'))next.push('把已有缺口用作人工验证清单；优先核实发生频率、现有替代与切换成本。公开讨论不能验证实际付款。');
 if(outcome.researchComplete)next.push('原研究草稿和机会卡保留；第二轮没有完成的主张仍待核查，可通过人工反思记录纠正。');
 return next;
}
export function workflowStageOutcome(p:Project,w=p.workflow):StageOutcome|null{
 if(!w)return null;
 const audit=w.conclusionAudit,auditStopped=w.status==='completed'&&!!audit&&['failed','cancelled','stale'].includes(audit.status);
 if(!unresolved.has(w.status)&&!auditStopped)return null;
 const historical=w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0)||w.status==='stale'||!!w.conclusionReview;
 const builder=sourceBuilder(p),groups:OutcomeGroup[]=[],completed:string[]=[];let withheld=0;
 for(const record of w.records){
  if(Array.isArray(record.input?.evidence))for(const item of record.input.evidence){const e=item as Evidence;if(e&&typeof e.id==='string'&&typeof e.text==='string')builder.add(e,'input');}
  if(record.state!=='done')continue;
  if(record.input?.purpose){completed.push(workflowStages[record.stage]);continue;}
  if(record.kind==='model')try{const group=acceptedGroup(record.id,record.stage,workflowStages[record.stage],record.input,record.output,builder.add);if(group){groups.push(group);completed.push(workflowStages[record.stage]);}else withheld++;}catch{withheld++;}
  else completed.push(workflowStages[record.stage]);
 }
 // Frozen originals can be delivered even when the first role fails. Live
 // project sources are never substituted for an old scope's frozen input.
 if(w.frozen)w.frozen.evidence.forEach(e=>builder.add(e,'input'));
 if(!historical)p.evidence.filter(e=>!e.excluded&&(w.usableIds.includes(e.id)||e.kind==='imported')).forEach(e=>builder.add(e,'project'));
 const candidates=w.mode==='four'?['needs','commercial','verifier','synthesis','check','deliver']:['analyze','check','deliver'];
 const missing=candidates.filter(stage=>!w.records.some(r=>r.stage===stage&&r.state==='done')||groups.every(g=>g.stage!==stage)&&['analyze','needs','commercial','verifier','synthesis'].includes(stage)).map(stage=>workflowStages[stage as keyof typeof workflowStages]);
 if(auditStopped)missing.push('结论反证第二轮');
 const receipts=w.records.filter(r=>r.kind==='model').flatMap(r=>r.agentModelReceipts||[{usage:r.usage}]),known=receipts.filter(r=>r.usage),attempts=w.budget.modelAttempts;
 const outcome:StageOutcome={id:w.id,title:auditStopped?'原研究已有成果 · 第二轮复核未完成':'本轮已有成果 · 阶段报告',scopeTitle:w.frozen?.brief.title||w.records.find(r=>r.input)?.input?.brief.title||(historical?'历史研究（方向未保存在快照）':p.title),status:auditStopped?audit!.status:w.status,revision:w.revision,evidenceVersion:w.evidenceVersion,historical,simulation:!!w.analysisRun?.simulation,researchComplete:w.status==='completed',summary:'',failure:errorLabels[auditStopped?audit!.error:w.error]||'',groups,sources:builder.sources,completed:[...new Set(completed)],missing,limitations:[...w.limitations],next:[],withheld,budget:{attempts,limit:w.budget.modelLimit,...(audit?{auditAttempts:audit.budget.modelAttempts}:{}),receipts:known.length,input:known.reduce((n,r)=>n+r.usage!.input_tokens,0),output:known.reduce((n,r)=>n+r.usage!.output_tokens,0),unknown:Math.max(0,attempts-known.length)},report:''};
 outcome.summary=meaning(groups,outcome.sources,outcome.researchComplete,historical,outcome.simulation);outcome.next=commonNext(outcome);
 for(const query of w.queries)outcome.limitations.unshift(`已保存检索词：${query.query}（计划或检索记录，不是市场结论）`);
 if(w.framing)outcome.limitations.unshift(`研究问题：${w.framing.questions.join('；')}（规划问题，不是已回答结论）`);
 if(!historical&&!auditStopped){const block=workflowAdvanceBlockReason(p,w);if(block)outcome.next.unshift(block);else if(w.status==='failed'){const reason=workflowRetryBlockReason({...p,workflow:w});outcome.next.unshift(reason||'可在剩余预算内手动准备重试当前步骤；本报告本身不触发重试。');}else if(['paused','ready'].includes(w.status))outcome.next.unshift(w.status==='paused'?'先恢复项目及研究检查点，再在已确认预算内继续。':'研究尚未结束，可在当前检查点查看并手动继续。');}
 if(outcome.failure===errorLabels.FREE_QUOTA_EXHAUSTED)outcome.next.unshift('先核查百炼免费额度；额度恢复前不要重新调用，不会切换到付费模式。');
 outcome.report=stageOutcomeReport(outcome);return outcome;
}
export function runStageOutcome(p:Project,r=p.run):StageOutcome|null{
 if(!r||!unresolved.has(r.status))return null;
 const builder=sourceBuilder(p),groups:OutcomeGroup[]=[],completed:string[]=[];let withheld=0;
 for(const task of r.tasks){if(task.inputSnapshot)(task.inputSnapshot.evidence as Evidence[]).forEach(e=>builder.add(e,'input'));if(task.status!=='done')continue;if(!task.role){completed.push(task.label);continue;}try{const group=acceptedGroup(task.id,task.id,task.label,task.inputSnapshot,task.output,builder.add);if(group){groups.push(group);completed.push(task.label);}else withheld++;}catch{withheld++;}}
 const historical=r.revision!==p.revision||r.evidenceVersion!==(p.evidenceVersion||0)||r.status==='stale'||!!r.conclusionReview;
 if(!historical)p.evidence.filter(e=>!e.excluded&&(r.simulation||e.kind!=='synthetic')).forEach(e=>builder.add(e,'project'));
 const known=r.tasks.flatMap(t=>t.calls).filter(c=>c.usage),attempts=r.adapter==='qwen'?(r.budget.requests??r.budget.attempts):r.budget.attempts;
 const outcome:StageOutcome={id:r.id,title:'本次执行已有成果 · 阶段报告',scopeTitle:r.tasks.find(t=>t.inputSnapshot)?.inputSnapshot?.brief.title||(historical?'历史研究（方向未保存在快照）':p.title),status:r.status,revision:r.revision,evidenceVersion:r.evidenceVersion,historical,simulation:r.simulation,researchComplete:false,summary:'',failure:errorLabels[r.tasks.find(t=>t.status==='failed')?.error||'']||'',groups,sources:builder.sources,completed,missing:r.tasks.filter(t=>t.status!=='done'||t.role&&!groups.some(g=>g.id===t.id)).map(t=>t.label),limitations:[],next:[],withheld,budget:{attempts,limit:r.budget.limit,receipts:known.length,input:known.reduce((n,c)=>n+c.usage!.input_tokens,0),output:known.reduce((n,c)=>n+c.usage!.output_tokens,0),unknown:r.simulation?0:Math.max(0,attempts-known.length)},report:''};
 outcome.summary=meaning(groups,outcome.sources,false,historical,r.simulation);outcome.next=commonNext(outcome);
 if(r.status==='failed')outcome.next.unshift(runRetryBlockReason(r)||'可以手动准备重试失败步骤，失败也计入原有上限；本报告不发起请求。');
 const pending=r.tasks.find(t=>t.status==='pending'&&t.deps.every(id=>r.tasks.find(x=>x.id===id)?.status==='done'));
 if(r.status==='ready'&&pending?.role&&r.budget.attempts>=r.budget.limit)outcome.next.unshift('模型预算已用尽，请保留阶段报告并结束本次执行。新执行需另行确认预算。');
 if(outcome.failure===errorLabels.FREE_QUOTA_EXHAUSTED)outcome.next.unshift('先核查百炼免费额度；额度恢复前不要重新调用，不会切换到付费模式。');
 outcome.report=stageOutcomeReport(outcome);return outcome;
}
export function stageOutcomeReport(o:StageOutcome){
 const groups=o.groups.map(g=>`### ${clean(g.label)} · ${roleNames[g.role]}\n\n${g.data.notes.map(n=>`- ${claimKindLabels[n.kind]}：${clean(n.claim)}\n  原引用：${n.refs.map(clean).join(' / ')||'无；保留未知'}`).join('\n')}\n${g.data.proposal?`\n候选问题：${clean(g.data.proposal.problem)}\n\n候选判断：${clean(g.data.proposal.conclusion)}\n\n模型建议（非人工决策）：${clean(g.data.proposal.decision)}\n\n原引用：${g.data.proposal.refs.map(clean).join(' / ')||'无；保留未知'}\n\n已有替代：${clean(g.data.proposal.alternative)}\n\n反证：${clean(g.data.proposal.counter)}\n\n未知项：${clean(g.data.proposal.unknowns)}\n\n验证计划（尚未执行）：${clean(g.data.proposal.plan)}\n`:''}\n${g.checks.map(c=>`- ${clean(c.claim)}：${checkAssessmentLabel(c)}；${clean(c.reason)}\n${c.anchors.map(a=>`  资料 ${clean(a.evidence_id)}，输入片段位置 ${a.start}–${a.end}\n${quoted(a.quote)}`).join('\n')}`).join('\n')}\n${g.gaps.map(gap=>'- 保留缺口：'+clean(gap)).join('\n')}`).join('\n\n');
 const sources=o.sources.map(s=>`### ${s.key} · 资料 ${clean(s.id)} · ${clean(s.title)}\n\n性质：${s.kind==='synthetic'?'虚构样例':s.kind==='public'?'公开线索':'导入资料'}；${s.origin==='input'?'原模型输入快照':'当前项目资料，未据此补写分析'}；${s.current?'仍匹配当前资料':'已删除、排除或变更，仅作历史输入'}；${s.truncated?'已裁剪':'快照所存片段'}\n\n来源：${clean(s.source)}；日期：${clean(s.date||'未知')}\n\n${quoted(s.text)}`).join('\n\n');
 const coverage=sourceCoverage(o.sources.map(s=>({id:s.id,title:s.title,text:s.text,source:s.source,date:s.date,fetched:'',author:'',thread:s.id,url:'',kind:s.kind,stance:'context',excluded:false,truncated:s.truncated})));
 return `# ${o.title}\n\n研究方向：${clean(o.scopeTitle)}\n研究 / 资料版本：${o.revision} / ${o.evidenceVersion}；记录编号：${o.id}\n\n**${o.simulation?'模拟流程，不构成市场证据。':o.historical?'历史输入，不能作为当前结论。':'阶段分析待人工核查，不是完整验证结论。'}**\n\n${o.summary}\n\n## 已获得什么\n\n已完成步骤：${o.completed.map(clean).join('；')||'无'}\n可交付阶段分析：${o.groups.length} 份；原文版本：${o.sources.length} 份。同编号不同文本分别保留，不是新增独立样本。\n\n${groups||'尚无可交付的模型分析；应用没有补写机会结论。'}\n\n## 还不能判断什么\n\n未完成或不可交付：${o.missing.map(clean).join('；')||'原研究已完成，第二轮核查未完成'}\n${o.failure?'停止原因：'+o.failure+'。执行失败不能用于判断机会存在或不存在。':'本轮尚未形成完整交付或已由用户暂停/结束。'}\n${o.withheld?'有 '+o.withheld+' 份旧结果无法按保存的输入重新校验，未纳入成果。':''}\n证据不足是有效研究信息；没有资料、没有反证或请求失败不等于没有需求。公开讨论、自述和角色一致均不能证明实际付款。\n\n## 下一步\n\n${o.next.map(s=>'- '+clean(s)).join('\n')}\n\n## 来源与适用边界\n\n${[...o.limitations,...coverage.qualification].map(s=>'- '+clean(s)).join('\n')}\n资料可能只是裁剪片段，原文支持度及人群/地域/时间范围仍需核查。\n\n## 请求与交付边界\n\n原轮模型尝试 ${o.budget.attempts} / ${o.budget.limit}${o.budget.auditAttempts!==undefined?'；第二轮尝试 '+o.budget.auditAttempts+' / 1':''}；有回执 ${o.budget.receipts} 次，已知输入 / 输出词元 ${o.budget.input} / ${o.budget.output}，未知用量请求 ${o.budget.unknown} 次。第二轮详细回执仍在复核记录。\n本阶段报告由本地规则整理；额外模型调用 0。不自动重试、保存正式机会卡或确认记忆，不改写原轮状态与费用记录。\n\n## 所附原文\n\n${sources||'无可交付原文。'}\n`;
}
