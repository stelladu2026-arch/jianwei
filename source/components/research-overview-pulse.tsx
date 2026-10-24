'use client';
import type {Project} from '@/lib/research/domain';
import {projectSummaryCounts,type ProjectSummary} from '@/lib/research/project-summary';
export function ResearchOverviewPulse({projects,loading=false}:{projects:(Project|ProjectSummary)[];loading?:boolean}){
 const active=projects.filter(p=>!p.archived);
 const metrics=[{label:'研究项目',value:active.length,note:'从问题开始，保留每轮判断',symbol:'01'},{label:'可用原文片段',value:active.reduce((n,p)=>n+projectSummaryCounts(p).usable,0),note:'保留来源，随时回到原文',symbol:'02'},{label:'待确认机会草稿',value:active.reduce((n,p)=>n+projectSummaryCounts(p).drafts,0),note:'模型建议，还需你的判断',symbol:'03'}];
 return <div className="overview-pulse" aria-label="研究工作区概览">{metrics.map(m=><div className="pulse-metric" key={m.symbol}><div><span className="pulse-symbol" aria-hidden="true">{m.symbol}</span><span>{m.label}</span></div><strong>{loading?'—':m.value}</strong><p>{m.note}</p></div>)}</div>;
}
