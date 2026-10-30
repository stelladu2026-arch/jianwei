'use client';
import {useEffect,useRef,useState} from 'react';
import {ResearchWaitFeedback} from './research-activity';
import {conclusionAuditBlockReason,auditRetryBlockReason,auditModelUsage} from '@/lib/research/conclusion-audit';
import type {WaitingRequest} from '@/lib/research/wait-feedback';
import type {Project} from '@/lib/research/domain';
import {requestJSON} from '@/lib/research/browser-api';
import {errorLabels} from '@/lib/research/execution';
import {describeReviewIssue,judgmentLabels} from '@/lib/research/review-contract';
import {roleNames} from '@/lib/research/governance';
import type {Role} from '@/lib/research/model-port';
const states={ready:'等待执行',running:'复核中',completed:'复核完成，待人工核查',failed:'复核已停止',cancelled:'复核已结束',stale:'依据已改变，待重新研究'};
export function ConclusionAuditPanel({project:p,onUpdate,onEvidence,onGovernance,busy,providerReady}:{project:Project;onUpdate:(p:Project)=>void;onEvidence:(id:string)=>void;onGovernance:()=>void;busy:boolean;providerReady:boolean}){
 const [working,setWorking]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 const w=p.workflow,a=w?.conclusionAudit;
 const active=useRef(true),mutations=useRef(new Set<string>());
 const [pending,setPending]=useState<WaitingRequest|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{setError('')},[p.id,w?.id]);
 useEffect(()=>{if(!a?.lease)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[a?.lease?.callId]);
 async function refresh(){const value=await requestJSON<{project:Project}>(`/api/projects/${p.id}/conclusion-review`);if(active.current)onUpdate(value.project);return value.project;}
 useEffect(()=>{if(!pending&&!a?.lease)return;let disposed=false,inflight=false;async function poll(){if(disposed||inflight)return;inflight=true;try{const value=await requestJSON<{project:Project}>(`/api/projects/${p.id}/conclusion-review`);if(!disposed&&active.current)onUpdate(value.project)}catch{}finally{inflight=false}}void poll();const timer=setInterval(poll,2500);return()=>{disposed=true;clearInterval(timer)}},[p.id,pending?.id,a?.lease?.callId]);
 async function operate(action:string){if(mutations.current.has(action)||(mutations.current.size>0&&action!=='cancel'))return;mutations.current.add(action);setWorking(true);setError('');const callId=crypto.randomUUID();if(action==='advance')setPending({id:callId,stage:'conclusion_review',startedAt:Date.now()});try{const latest=await refresh();if(!active.current)return;const value=await requestJSON<{project:Project}>(`/api/projects/${p.id}/conclusion-review`,{method:'POST',body:JSON.stringify({version:latest.version,callId,action,freeTierOnlyConfirmed:providerReady})});if(active.current)onUpdate(value.project);}catch(e){if(active.current){setError((e as Error).message);try{await refresh()}catch{}}}finally{mutations.current.delete(action);if(active.current){if(action==='advance')setPending(null);setWorking(mutations.current.size>0)}}}
 const blockReason=conclusionAuditBlockReason(p),allowed=!blockReason,retryReason=auditRetryBlockReason(p),usage=a?auditModelUsage(a):null;
 if(!a&&!allowed)return null;
 return <section className="panel" aria-label="结论反证复核"><div className="panel-heading"><div><h2>结论反证复核（可选第二轮）</h2><p className="subdued">{w?.mode==='single'?'逐项复核问题、判断与反证，使用各字段自己的引用；缺失依据保留未知。':'首轮反证独立看原文；本轮再读取四个角色的完整主张及协调结论，逐项对照同一批原文。'}</p></div><button className="button secondary" disabled={busy} onClick={()=>refresh().catch(e=>setError(e.message))}>刷新复核检查点</button></div>
  <p className="source-note">本阶段最多新增 2 次模型请求；失败也计入，不自动重试。新四角色研究各阶段最多 2 次、合计最多 8 次；历史研究保留原有上限。本轮不采集新资料，模型判断须人工核查。</p>
  {!a&&<p>先创建不调用模型的检查点，核对待复核主张后，再点击“执行一次结论复核”。</p>}
  {(!a||a.status==='ready')&&<><div className="toolbar"><button className="button primary" disabled={busy||working||!allowed||!providerReady} onClick={()=>operate(a?'advance':'start')}>{working?'正在处理…':a?'执行一次结论复核':'创建结论复核检查点'}</button></div>{!providerReady&&<p className="warning-text">请使用上方“刷新服务状态”确认配置就绪，再执行复核。</p>}</>}
  {a&&<><ResearchWaitFeedback status={a.status} stage="conclusion_review" label="结论反证复核" lease={a.lease} startedAt={a.started} pending={pending}/><p><strong>{states[a.status]}</strong> · 请求尝试 {a.budget.modelAttempts} / {a.budget.modelLimit}</p>{!allowed&&<p className="warning-text">{errorLabels[blockReason]||blockReason}</p>}
   <div className="toolbar">{['ready','running','failed'].includes(a.status)&&<button className="button secondary" disabled={busy||(working&&!pending)} onClick={()=>operate('cancel')}>保留记录并结束复核</button>}{a.lease&&<button className="button secondary" disabled={busy||working||Date.parse(a.lease.expires)>now} onClick={()=>operate('recover')}>恢复过期复核检查点</button>}</div>
   {a.status==='running'&&<p className="meta">请求已发出，刷新不会重复调用。关闭页面或连接中断后，先刷新检查点；超期可恢复检查点并保留未知用量。结束复核会拒绝迟到结果。</p>}
   {['failed','cancelled'].includes(a.status)&&<div className="workflow-recovery"><h3>下一步怎么处理？</h3><p>{a.error?errorLabels[a.error]||a.error:'本轮已结束，已有研究草稿保留。'} 先查看下方详情及原文；{retryReason||'可在剩余阶段额度内手动准备重试，再执行复核；首轮记录和次数保留。'}原记录会留在研究历史中。</p>{a.status==='failed'&&!retryReason&&<button className="button secondary" disabled={busy||working||!providerReady} onClick={()=>operate('retry')}>准备重试结论复核</button>}<button className="button secondary" onClick={onGovernance}>记录人工反思与纠正</button></div>}
   {a.status==='stale'&&<p>旧复核依据已失效，记录仅供参考。请在上方核对范围，以当前有效资料开始新一轮研究。</p>}
   {a.status==='completed'&&a.checks?.some(c=>c.judgment!=='supports')&&<p className="warning-text">存在部分支持、证据不足或矛盾的主张；原草稿仍是历史模型判断，不能据此直接确认机会。请逐项核对下方原文与缺口。</p>}
   {a.checks?.map(c=><article className="claim-review" key={c.target}><div className="spread"><strong>{roleNames[c.target.split(':')[0] as Role]}：{c.claim}</strong><span className="tag amber">模型判断：{judgmentLabels[c.judgment]}</span></div><p>{c.reason}</p>{c.anchors.map((anchor,i)=><div className="quote-anchor" key={i}><blockquote>{anchor.quote}</blockquote><button className="button subtle" onClick={()=>onEvidence(anchor.evidence_id)}>查看原文 [{anchor.evidence_id}]</button><span className="meta">已定位冻结输入中的片段 {anchor.start}–{anchor.end}</span></div>)}{!c.anchors.length&&<p className="meta">未给出可定位片段，保留证据不足。</p>}</article>)}
   {a.gaps?.map((gap,i)=><p className="source-note" key={i}>保留缺口：{gap}</p>)}
   {a.input?<details><summary>查看本轮全部待核查主张（{a.input.review_claims?.length} 项）</summary>{a.input.review_claims?.map(c=><p key={c.target}>{roleNames[c.role]} · {c.claim} · 原引用 {c.refs.join(' / ')||'无'}</p>)}</details>:a.status==='ready'&&<p className="meta">本轮将逐项复核下方四角色记录中的全部笔记及协调角色的问题、结论；主张不会截断。输入过长会在调用前停止。</p>}
   <details><summary>复核用量与失败详情</summary>{!!a.calls?.length&&<ol>{a.calls.map((call,i)=><li key={call.id}>第 {i+1} 次：{call.error?errorLabels[call.error]||call.error:'通过检查'}；输入 / 输出词元：{call.usage?`${call.usage.input_tokens} / ${call.usage.output_tokens}`:'用量未知'}；请求编号：{call.requestId||'无'}</li>)}</ol>}<p>输入 / 输出词元：{a.budget.modelAttempts?`${usage!.input} / ${usage!.output}；无用量回执 ${usage!.unknown} 次`:'尚未调用'}</p><p>安全请求编号：{a.requestId||'无'}</p>{a.outputIssues?.map((issue,i)=><p key={i}>{issue}：{describeReviewIssue(issue)}</p>)}<p className="meta">源指纹：{a.sourceHash}。不会自动更新原研究草稿、机会卡、人工评审或已验证记忆。</p></details>
  </>}
  {error&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>refresh().catch(e=>setError(e.message))}>刷新确认结果</button><button onClick={()=>setError('')}>关闭</button></div>}
 </section>;
}
