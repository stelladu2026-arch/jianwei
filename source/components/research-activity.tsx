'use client';
import {useEffect,useState} from 'react';
import {waitingFeedback,waitingDuration,type WaitingInput,type WaitingRequest} from '@/lib/research/wait-feedback';
import type {ResearchWorkflow} from '@/lib/research/workflow';
const names:Record<string,string>={hacker_news_search:'社区检索',hacker_news_read:'读取原文',zh_wikipedia_extract:'百科摘录',retrieve_project_evidence:'检索项目资料',model:'模型请求'};
function useWaitingClock(enabled:boolean,fixed?:number){const [clock,setClock]=useState(()=>Date.now());useEffect(()=>{if(!enabled||fixed!==undefined)return;setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[enabled,fixed]);return fixed??clock;}
export function ResearchWaitFeedback({label,now,...input}:WaitingInput&{label:string;now?:number}){
 const clock=useWaitingClock(input.status==='running'||!!input.pending,now),feedback=waitingFeedback(input,clock);
 if(feedback.phase==='idle')return null;
 return <div className={'waiting-feedback '+(feedback.animated?'is-waiting':'waiting-uncertain')} aria-label="当前阶段等待状态"><div className="waiting-topline"><span className="waiting-current">{feedback.phase==='submitting'?'正在提交':feedback.phase==='running'?'正在处理':'状态待确认'} · {label}<span className="waiting-dots" aria-hidden="true"><i/><i/><i/></span></span>{feedback.elapsed!==null&&<span className="waiting-elapsed" role="timer" aria-live="off">已等待 {waitingDuration(feedback.elapsed)}</span>}</div><p className="waiting-hint" key={feedback.message}>{feedback.message}</p>{feedback.animated&&<div className="waiting-track" role="progressbar" aria-label="当前阶段处理中" aria-valuetext="完成进度暂不可确定"><span/></div>}<p className="waiting-boundary">{feedback.phase==='uncertain'?'页面不会自动重发请求；先确认检查点再决定下一步。':feedback.longWait?'本阶段耗时较长，结果返回后会自动更新；可刷新检查点核对状态，请勿重复发起。':'各阶段耗时不同，暂无法准确预估剩余时间；结果返回后自动更新。'}</p></div>;
}
export function ResearchActivity({workflow:w,stages,now,pending}:{workflow:ResearchWorkflow;stages:Record<string,string>;now?:number;pending?:WaitingRequest|null}){
 const clock=useWaitingClock(w.status==='running'||!!pending,now);
 const record=w.records.find(r=>r.id===w.lease?.callId)||w.records.filter(r=>r.stage===w.stage&&r.state==='running').at(-1);
 const wait={status:w.status,stage:w.stage,lease:w.lease,startedAt:record?.started,pending};
 const feedback=waitingFeedback(wait,clock),running=feedback.phase==='running',submitting=feedback.phase==='submitting';
 const finished=Object.keys(stages).filter(key=>w.records.filter(r=>r.stage===key).at(-1)?.state==='done'&&(w.status==='completed'||key!==w.stage)).length;
 const tools=w.records.flatMap(r=>r.agentTools||[]);
 const title=submitting?`正在提交 · ${stages[w.stage]||w.stage}`:running?`正在执行 · ${stages[w.stage]||w.stage}`:w.status==='running'?'执行状态待确认，请核对检查点':w.status==='completed'?'研究草稿已就绪':w.status==='failed'?'执行已停止，已有成果保留':w.status==='paused'?'研究已暂停':w.status==='stale'?'依据已改变，请重新核查':w.status==='cancelled'?'本轮已结束':'检查点已就绪，等待继续';
 return <div className={'research-activity '+(running?'is-running':submitting?'is-submitting':'')} aria-label="研究执行状态" data-status={w.status}>
  <div className="activity-heading"><span className="activity-orbit" aria-hidden="true"><i/><i/><b/></span><div><span className="section-kicker">研究进程</span><h3 aria-live="polite">{title}</h3><p className="meta">{submitting?'当前请求已提交，正在确认服务端进度。':running?'当前请求已发出；暂停或关闭页面不会撤销已发出的请求。':w.status==='running'?'执行租约已过期或缺失，请核对检查点；当前无法确认模型是否仍在处理。':w.status==='completed'?'流程已完成，结论与机会草稿仍待人工核查。':'可以查看阶段成果、处理检查点；页面不会自行开始新一轮。'}</p></div><span className="activity-count">已完成 <strong>{finished}</strong> 个阶段</span></div>
  <ResearchWaitFeedback {...wait} label={stages[w.stage]||w.stage} now={clock}/>
  <ol className="research-step-list">{Object.entries(stages).map(([key,label],i)=>{
   const record=w.records.filter(r=>r.stage===key).at(-1),current=w.stage===key&&w.status!=='completed';
   const state=current&&running?'running':current&&submitting?'submitting':record?.state==='failed'?'failed':record?.state==='done'&&!current?'done':current?'current':w.status==='completed'?'skipped':'pending';
   const captions={submitting:'正在提交',done:'已完成',failed:'已停止',running:'执行中',current:w.status==='paused'?'已暂停':w.status==='stale'?'需复核':w.status==='running'?'状态待确认':['failed','cancelled','partial'].includes(w.status)?'已结束':'等待处理',skipped:'本轮未触发',pending:'尚未执行'};
   return <li key={key} className={'research-step step-'+state} aria-current={current?'step':undefined}><span className="step-number" aria-hidden="true">{state==='done'?'✓':String(i+1).padStart(2,'0')}</span><div><strong>{label}</strong><span>{record?.collectionCloseout?'已收尾 · 部分检索未执行':captions[state]}</span></div></li>;
  })}</ol>
  {!!tools.length&&<details className="activity-tools"><summary>工具活动 · {tools.length} 条记录</summary><div className="tool-chip-list">{Object.entries(Object.groupBy(tools,t=>t.name+':'+t.status)).map(([key,rows])=><span key={key} className={'tool-chip '+(rows![0].status==='refused'?'tool-refused':'')}><span className="tool-chip-dot" aria-hidden="true"/>{names[rows![0].name]||'工具记录'} · {rows![0].status==='executed'?'已执行':'未执行'} {rows!.length} 次</span>)}</div><p className="meta">工具记录反映执行情况，未执行项及停止原因可在下方执行记录查看；不代表资料已被核实。</p></details>}
 </div>;
}
