import type {Project} from './domain';
export type DeskDestination='brief'|'workflow'|'execution';
export type DeskProjectState={label:string;tone:'neutral'|'amber'|'rose'|'green';target:DeskDestination};
// Only current checkpoints are considered; archived histories cannot claim current progress.
export function projectDeskState(p:Project,now=Date.now()):DeskProjectState{
 if(p.archived)return {label:'已归档',tone:'neutral',target:'brief'};
 if(!p.confirmed)return {label:'待确认范围',tone:'amber',target:'brief'};
 if(p.status==='paused')return {label:'项目已暂停',tone:'amber',target:'brief'};
 if(p.status==='cancelled')return {label:'项目已取消',tone:'neutral',target:'brief'};
 if(p.status==='completed')return {label:'研究已完成',tone:'green',target:'brief'};
 const candidates=[
  ...(p.workflow?[{...p.workflow,target:'workflow' as const,prefix:'研究'}]:[]),
  ...(p.run?[{...p.run,target:'execution' as const,prefix:'执行'}]:[]),
  ...(p.workflow?.conclusionAudit?[{...p.workflow.conclusionAudit,target:'workflow' as const,prefix:'复核'}]:[])
 ];
 const active=candidates.filter(c=>['ready','running','paused','failed'].includes(c.status));
 const current=[...(active.length?active:candidates)].sort((a,b)=>(Date.parse(b.created)||0)-(Date.parse(a.created)||0))[0];
 if(!current)return {label:p.mode==='replay'?'演示待回放':'待开始研究',tone:'neutral',target:'brief'};
 const {target,prefix}=current;
 if(current.status==='stale'||current.revision!==p.revision||current.evidenceVersion!==(p.evidenceVersion||0))return {label:'依据已变更',tone:'amber',target};
 if(current.status==='running')return current.lease&&Date.parse(current.lease.expires)>now?{label:prefix==='研究'?'研究执行中':prefix==='复核'?'结论复核中':'步骤执行中',tone:'neutral',target}:{label:'进度待确认',tone:'amber',target};
 if(current.status==='failed')return {label:prefix+'已停止',tone:'rose',target};
 if(current.status==='paused')return {label:prefix+'已暂停',tone:'amber',target};
 if(current.status==='ready')return {label:prefix+'待继续',tone:'neutral',target};
 if(current.status==='partial')return {label:'资料不足，待补充',tone:'amber',target};
 if(current.status==='completed')return {label:prefix==='复核'?'复核完成，待确认':'草稿待确认',tone:'amber',target};
 return {label:prefix==='研究'?'本轮已结束':prefix+'已结束',tone:'neutral',target};
}
