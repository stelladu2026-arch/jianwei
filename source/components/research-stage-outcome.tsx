'use client';
import {checkAssessmentLabel} from '@/lib/research/review-contract';
import type {StageOutcome} from '@/lib/research/stage-outcomes';
import {claimKindLabels} from '@/lib/research/claim-kinds';
import {judgmentLabels} from '@/lib/research/review-contract';
import {ConclusionSummary} from './conclusion-summary';
function download(outcome:StageOutcome){const url=URL.createObjectURL(new Blob([outcome.report],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=outcome.simulation?'模拟阶段成果.md':'研究阶段成果.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ResearchStageOutcome({outcome:o,onSources,onCheckpoint,onGovernance}:{outcome:StageOutcome|null;onSources?:()=>void;onCheckpoint?:()=>void;onGovernance?:()=>void}){
 if(!o)return null;
 const candidate=[...o.groups].reverse().find(g=>g.data.proposal),lineage=candidate||o.groups.at(-1);
 return <section className="panel stage-outcome research-typesetting" aria-label="阶段成果报告"><div className="panel-heading"><div><h2>{o.title}</h2><p className="meta">研究 / 资料版本 {o.revision} / {o.evidenceVersion} · {o.historical?'历史输入':o.simulation?'模拟流程':'待人工核查'}</p></div><button className="button secondary" onClick={()=>download(o)}>导出阶段成果</button></div>
  <p className="source-note">{o.summary}</p>
  {o.failure&&<p className="warning-text">停止原因：{o.failure}。执行失败不能用于判断有没有需求。</p>}
  <ConclusionSummary proposal={candidate?.data.proposal} notes={lineage?.data.notes} checks={candidate?.checks} sources={o.sources.filter(s=>candidate?.sourceKeys.includes(s.key))} gaps={o.groups.flatMap(g=>g.gaps)} next={o.next} analysisCount={o.groups.length} scope={o.historical?'historical':o.simulation?'simulation':o.researchComplete?'draft':'stage'}/>
  <div className="budget-row"><span>已有阶段分析 / 原文版本</span><strong>{o.groups.length} 份 / {o.sources.length} 份</strong></div>
  <p className="meta">同编号不同文本按输入版本分别保留，不计为多个客户。所附输入快照可直接展开，删除原文后仍可追溯。</p>
  <div className="outcome-overview"><section className="copy-section"><h3>已获得什么</h3><p>{o.completed.length?'已完成：'+o.completed.join('、'):'尚无完成的研究步骤。'}</p></section>
  <section className="copy-section copy-section-caution"><h3>还不能判断什么</h3><p>{o.missing.length?'未完成或不可交付：'+o.missing.join('、'):'后续人工验证尚未完成。'}</p><p className="meta">支持度、真实发生频率、人群代表性与付款仍需核实。证据不足是有效研究信息，不能写成“没有需求”。</p></section></div>
  {o.groups.map(g=><details className="role-review" key={g.id}><summary>{g.label} · 已接受的阶段分析</summary>{g.data.notes.map((n,i)=><article className="claim-review" key={i}><span className="tag amber">{claimKindLabels[n.kind]}</span><p>{n.claim}</p><p className="meta">原引用：{n.refs.join(' / ')||'无；保留未知'}</p></article>)}{g.data.proposal&&<article className="claim-review"><h3>候选机会判断 · 后续核查未必完成</h3><p>问题：{g.data.proposal.problem}</p><p>判断：{g.data.proposal.conclusion}</p><p className="meta">原引用：{g.data.proposal.refs.join(' / ')||'无；保留未知'}</p><p>已有替代：{g.data.proposal.alternative}</p><p>反证：{g.data.proposal.counter}</p><p>未知项：{g.data.proposal.unknowns}</p><p>验证计划（尚未执行）：{g.data.proposal.plan}</p></article>}{g.checks.map(c=><div key={c.target} className="quote-anchor"><p>{c.claim} · {checkAssessmentLabel(c)}</p><p className="meta">{c.reason}</p>{c.anchors.map((a,i)=><blockquote key={i}>[{a.evidence_id}] {a.quote}<span className="meta"> · 原输入位置 {a.start}–{a.end}</span></blockquote>)}</div>)}{g.gaps.map((gap,i)=><p className="source-note" key={i}>保留缺口：{gap}</p>)}<details><summary>查看本阶段使用的原文快照</summary>{g.sourceKeys.map(key=>{const s=o.sources.find(s=>s.key===key)!;return <article key={key} className="claim-review"><strong>[{s.id}] {s.title}</strong><p className="meta">{s.source} · {s.date||'日期未知'} · {s.current?'仍匹配当前片段':'历史片段，已删除/排除/变更'}</p><blockquote>{s.text}</blockquote></article>})}</details></details>)}
  {!o.groups.length&&<p>尚无可交付的模型分析；可以先使用下方资料核对研究问题。应用没有补写机会结论。</p>}
  {o.withheld>0&&<p className="warning-text">{o.withheld} 份旧结果不能按保存的输入重新校验，未纳入本报告。</p>}
  <section className="outcome-next"><h3>下一步</h3><ul>{o.next.map((next,i)=><li key={i}>{next}</li>)}</ul><div className="toolbar">{onSources&&<button className="button secondary" onClick={onSources}>核对或补充原文</button>}{onCheckpoint&&<button className="button secondary" onClick={onCheckpoint}>前往研究检查点</button>}{onGovernance&&<button className="button subtle" onClick={onGovernance}>记录人工反思与纠正</button>}</div></section>
  <details><summary>查看全部所附原文（{o.sources.length} 份）</summary>{o.sources.map(s=><details key={s.key}><summary>[{s.id}] {s.title} · {s.origin==='input'?'输入快照':'当前项目资料，未据此补写分析'}</summary><p className="meta">{s.source} · {s.date||'日期未知'} · {s.current?'匹配当前片段':'历史输入'} · {s.kind==='synthetic'?'虚构样例':'来源及语境待核查'}</p><blockquote>{s.text}</blockquote></details>)}{!o.sources.length&&<p>尚无可交付原文。</p>}</details>
  <p className="meta">本报告由本地规则自动整理，额外模型调用 0。不会把被拒输出、未完成步骤或模拟结果包装成已验证结论，不自动保存正式机会卡或确认记忆。</p>
 </section>;
}
