 'use client';
import type {StartBlocker,StartAction} from '@/lib/research/workflow-start';
export function WorkflowStartHelp({issues,busy,onAction,coveredCodes=[]}:{issues:StartBlocker[];busy:boolean;onAction:(action:StartAction)=>void;coveredCodes?:readonly string[]}){
 const visible=issues.filter(issue=>!coveredCodes.includes(issue.code));
 if(!visible.length)return <span id="research-start-reasons" hidden/>;
 return <div className="start-inline" id="research-start-reasons" role="status" aria-live="polite">
 {visible.map(issue=><p key={issue.code}><span>{issue.message}</span>{!busy&&!['provider_loading','busy'].includes(issue.code)&&<button type="button" className="button subtle" onClick={()=>onAction(issue.action)}>{issue.label}</button>}{!busy&&['collection_budget','collection_capacity'].includes(issue.code)&&<button type="button" className="button subtle" onClick={()=>onAction('new')}>沿用范围新建研究</button>}{['collection_budget','collection_capacity'].includes(issue.code)&&<small>新项目仅预填研究范围，不会复制资料、重置旧项目用量或立即调用模型。</small>}</p>)}
 </div>;
}
