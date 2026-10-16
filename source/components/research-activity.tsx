'use client';
import type {ResearchWorkflow} from '@/lib/research/workflow';
const names:Record<string,string>={hacker_news_search:'社区检索',hacker_news_read:'读取原文',zh_wikipedia_extract:'百科摘录',retrieve_project_evidence:'检索项目资料',model:'模型请求'};
export function ResearchActivity({workflow:w,stages,now=Date.now()}:{workflow:ResearchWorkflow;stages:Record<string,string>;now?:number}){
 const running=w.status==='running'&&!!w.lease&&Date.parse(w.lease.expires)>now;
 const finished=Object.keys(stages).filter(key=>w.records.filter(r=>r.stage===key).at(-1)?.state==='done'&&(w.status==='completed'||key!==w.stage)).length;
 const tools=w.records.flatMap(r=>r.agentTools||[]);
 const title=running?`正在执行 · ${stages[w.stage]||w.stage}`:w.status==='running'?'执行状态待确认，请核对检查点':w.status==='completed'?'研究草稿已就绪':w.status==='failed'?'执行已停止，已有成果保留':w.status==='paused'?'研究已暂停':w.status==='stale'?'依据已改变，请重新核查':w.status==='cancelled'?'本轮已结束':'检查点已就绪，等待继续';
 return <div className={'research-activity '+(running?'is-running':'')} aria-label="研究执行状态" data-status={w.status}>
  <div className="activity-heading"><span className="activity-orbit" aria-hidden="true"><i/><i/><b/></span><div><span className="section-kicker">研究进程</span><h3 aria-live="polite">{title}</h3><p className="meta">{running?'当前请求已发出；暂停或关闭页面不会撤销已发出的请求。':w.status==='running'?'执行租约已过期或缺失，请核对检查点；当前无法确认模型是否仍在处理。':w.status==='completed'?'流程已完成，结论与机会草稿仍待人工核查。':'可以查看阶段成果、处理检查点；页面不会自行开始新一轮。'}</p></div><span className="activity-count">已完成 <strong>{finished}</strong> 个阶段</span></div>
  <ol className="research-step-list">{Object.entries(stages).map(([key,label],i)=>{
   const record=w.records.filter(r=>r.stage===key).at(-1),current=w.stage===key&&w.status!=='completed';
   const state=record?.state==='failed'?'failed':record?.state==='done'&&!current?'done':current&&running?'running':current?'current':w.status==='completed'?'skipped':'pending';
   const captions={done:'已完成',failed:'已停止',running:'执行中',current:w.status==='paused'?'已暂停':w.status==='stale'?'需复核':w.status==='running'?'状态待确认':['failed','cancelled','partial'].includes(w.status)?'已结束':'等待处理',skipped:'本轮未触发',pending:'尚未执行'};
   return <li key={key} className={'research-step step-'+state} aria-current={current?'step':undefined}><span className="step-number" aria-hidden="true">{state==='done'?'✓':String(i+1).padStart(2,'0')}</span><div><strong>{label}</strong><span>{captions[state]}</span></div></li>;
  })}</ol>
  {!!tools.length&&<details className="activity-tools"><summary>工具活动 · {tools.length} 条记录</summary><div className="tool-chip-list">{Object.entries(Object.groupBy(tools,t=>t.name+':'+t.status)).map(([key,rows])=><span key={key} className={'tool-chip '+(rows![0].status==='refused'?'tool-refused':'')}><span className="tool-chip-dot" aria-hidden="true"/>{names[rows![0].name]||'工具记录'} · {rows![0].status==='executed'?'已执行':'未执行'} {rows!.length} 次</span>)}</div><p className="meta">工具记录反映执行情况，未执行项及停止原因可在下方执行记录查看；不代表资料已被核实。</p></details>}
 </div>;
}
