'use client';
import type {Proposal,Analysis} from '@/lib/research/execution';
import type {LocatedCheck} from '@/lib/research/collaboration';
import type {OutcomeSource} from '@/lib/research/stage-outcomes';
import type {Opportunity} from '@/lib/research/domain';
type Scope='stage'|'draft'|'confirmed'|'historical'|'simulation';
export function opportunityConclusionScope(o:Pick<Opportunity,'stale'|'revision'|'reviewReason'|'status'>,revision:number,simulation=false):Scope{
 if(simulation)return 'simulation';
 if(o.stale||o.revision!==revision)return 'historical';
 if(o.status==='draft')return 'draft';
 return o.reviewReason?'historical':'confirmed';
}
const scopes={stage:'阶段判断 · 后续未完成',draft:'研究草稿 · 待人工确认',confirmed:'人工已确认 · 验证待执行',historical:'历史判断 · 需重新复核',simulation:'虚构演示 · 不构成研究结论'};
const decisions={validate:'继续小规模验证',evidence:'先补充关键证据',pause:'暂缓投入，核实后再决定'};
export function ConclusionSummary({proposal,notes=[],checks=[],sources=[],gaps=[],next=[],scope='stage',analysisCount=0,onEvidence}:{proposal?:Omit<Proposal,'payment'>;notes?:Analysis['notes'];checks?:LocatedCheck[];sources?:Pick<OutcomeSource,'key'|'id'|'title'|'text'|'source'|'date'|'current'>[];gaps?:string[];next?:string[];scope?:Scope;analysisCount?:number;onEvidence?:(id:string)=>void}){
 const refs=proposal?.refs||[],anchors=checks.find(c=>c.target==='proposal:conclusion')?.anchors||[];
 const cited=sources.filter(s=>refs.includes(s.id));
 const caution=scope==='historical'||scope==='simulation';
 return <div className={'conclusion-summary '+(caution?'conclusion-caution':'')} aria-label="结论摘要">
  <div className="conclusion-top"><span className="section-kicker">当前建议</span><span className={'tag '+(caution?'rose':'amber')}>{scopes[scope]}</span></div>
  <h3 className="conclusion-decision">{scope==='historical'?'先复核当前范围与原文':proposal?decisions[proposal.decision]:'尚未形成机会判断'}</h3>
  {proposal?<><h4>{proposal.title}</h4><p className="conclusion-statement">{proposal.conclusion||'判断尚未填写。'}</p><p className="meta">研究问题：{proposal.problem}</p></>:<p className="conclusion-statement">{analysisCount?`已有 ${analysisCount} 份阶段分析，可先核查线索；汇总结论尚未完成。`:'尚无可交付的机会分析。先核对资料与停止原因；当前不能判断是否存在需求。'}</p>}
  <div className="conclusion-grid"><section className="conclusion-action"><span className="section-kicker">下一步行动</span><p>{scope==='historical'?'核对当前范围及引用；历史计划仅供追溯。':proposal?.plan||next[0]||'补充有来源的原文，明确需要回答的研究问题。'}</p><small>计划尚未执行；流程完成不代表机会已被证实。</small></section><section className="conclusion-risk"><span className="section-kicker">反证与待验证项</span><p>{proposal?.counter||'尚未形成完整反证判断；没有反例不能视为支持。'}</p><p className="meta">待验证：{proposal?.unknowns||gaps.join('；')||'发生频率、适用人群、现有替代及实际付款。'}</p></section></div>
  {proposal&&<details className="conclusion-evidence"><summary>原文依据 · {new Set(refs).size} 个资料编号 · 展开核查</summary><p className="meta">引用数量不是客户数量；原文可定位不代表主张或付款已经证实。</p>{anchors.map((a,i)=><blockquote key={i}>[{a.evidence_id}] {a.quote}</blockquote>)}{cited.map(s=><article className="claim-review" key={s.key}><strong>[{s.id}] {s.title}</strong><p className="meta">{s.source} · {s.date||'日期未知'} · {s.current?'当前保存片段':'历史输入快照'}</p><blockquote>{s.text}</blockquote>{onEvidence&&s.current&&scope!=='historical'&&<button className="button subtle" onClick={()=>onEvidence(s.id)}>查看资料详情</button>}</article>)}{refs.filter(id=>!cited.some(s=>s.id===id)).map(id=><p className="warning-text" key={id}>[{id}] 此摘要未附对应原文，请到执行记录核对输入快照。</p>)}{!refs.length&&<p>该判断没有引用原文，需补充依据。</p>}<p>现有替代：{proposal.alternative||'待核查'}</p></details>}
  {!proposal&&!!notes.length&&<details><summary>查看本阶段线索（未形成汇总判断）</summary>{notes.map((n,i)=><p key={i}>{n.claim}<span className="meta"> · {n.refs.join(' / ')||'无引用，待核查'}</span></p>)}</details>}
 </div>;
}
