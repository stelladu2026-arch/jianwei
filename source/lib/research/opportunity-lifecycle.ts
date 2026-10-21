import type {Opportunity,Project} from './domain';
import type {Proposal} from './execution';

export function workflowOpportunity(p:Project){
 const runId=p.workflow?.analysisRun?.id;
 return runId?p.opportunities.find(o=>o.sourceRunId===runId):undefined;
}
export function opportunityForReview(p:Project,proposal:Proposal):Opportunity{
 const existing=workflowOpportunity(p);
 if(existing)return {...existing,refs:[...existing.refs]};
 return {...proposal,id:'',stale:false,revision:p.revision,sourceRunId:p.workflow?.analysisRun?.id};
}
export function opportunityNextStep(o:Opportunity){
 if(o.stale)return {title:'先复核依据，再更新判断',text:'范围或资料已变化。核对当前原文、反证与未知项，再保存复核结果。',action:'review' as const,label:'复核机会卡'};
 if(o.status==='draft')return {title:'草稿已保存，等待人工复核',text:'请核对引用是否支持主张，并检查反证、未知项与验证计划。确认后会更新这张卡，不会新增副本。',action:'review' as const,label:'人工复核并确认'};
 if(!o.plan.trim())return {title:'下一步：补齐验证计划',text:'写清验证对象、具体步骤，以及什么证据会让你继续或停止。保存机会卡不代表需求已经成立。',action:'plan' as const,label:'完善验证计划'};
 if(o.decision==='pause')return {title:'下一步：保留暂缓的依据',text:'记录重新考虑的条件；可保存报告快照，方便后续对照。保存不会自动启动新研究。',action:'report' as const,label:'查看报告与保存快照'};
 return {title:o.decision==='evidence'?'下一步：补充关键证据':'下一步：按计划开展小规模验证',text:'先查看本卡计划，完成访谈或实验后导入有来源的原文，再复核判断。本页仅记录计划，执行结果需另行导入；公开讨论不等于实际付费。',action:'plan' as const,label:'查看本卡验证计划'};
}
export function opportunityTarget(id:string,view:'opportunities'|'report'){return (view==='report'?'validation-':'opportunity-')+id;}
