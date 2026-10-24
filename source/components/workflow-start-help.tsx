'use client';
import type {StartBlocker,StartAction} from '@/lib/research/workflow-start';
export function WorkflowStartHelp({issues,busy,onAction,coveredCodes=[]}:{issues:StartBlocker[];busy:boolean;onAction:(action:StartAction)=>void;coveredCodes?:readonly string[]}){
 const visible=issues.filter(issue=>!coveredCodes.includes(issue.code));
 if(!visible.length)return <span id="research-start-reasons" hidden/>;
 return <div className="workflow-recovery start-checklist" id="research-start-reasons" role="status" aria-live="polite"><h3>开始前还需完成 {visible.length} 项</h3><ul>{visible.map(issue=><li key={issue.code}><p>{issue.message}</p><button className="button secondary" disabled={busy||issue.code==='provider_loading'||issue.code==='busy'} onClick={()=>onAction(issue.action)}>{issue.label}</button></li>)}</ul>{visible.some(i=>i.code==='collection_budget'||i.code==='collection_capacity')&&<div className="start-alternative"><button className="button secondary" disabled={busy} onClick={()=>onAction('new')}>沿用范围新建研究</button><p className="meta">仅预填研究范围，需确认后创建新项目；不会复制资料、重置旧项目用量或立即调用模型。</p></div>}</div>;
}
