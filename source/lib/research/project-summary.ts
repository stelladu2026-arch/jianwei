import type {Project} from './domain';
import type {DeskProject,DeskCheckpoint} from './project-desk-state';

export type ProjectSummary=DeskProject&{
 summaryVersion:1;version:number;title:string;audience:string;created:string;updated:string;
 counts:{evidence:number;usable:number;opportunities:number;drafts:number};
};
function checkpoint(value:DeskCheckpoint|undefined):DeskCheckpoint|undefined{
 if(!value)return undefined;
 return {status:value.status,revision:value.revision,evidenceVersion:value.evidenceVersion,created:value.created,...(value.lease?{lease:{expires:value.lease.expires}}:{})};
}
export function toProjectSummary(p:Project):ProjectSummary{
 const flow=checkpoint(p.workflow),audit=checkpoint(p.workflow?.conclusionAudit);
 return {summaryVersion:1,id:p.id,version:p.version,revision:p.revision,title:p.title,audience:p.audience,mode:p.mode,status:p.status,archived:p.archived,confirmed:p.confirmed,evidenceVersion:p.evidenceVersion,created:p.created,updated:p.updated,
  counts:projectSummaryCounts(p),...(flow?{workflow:{...flow,...(audit?{conclusionAudit:audit}:{})}}:{}),...(p.run?{run:checkpoint(p.run)}:{})};
}
export function projectSummaryCounts(p:Project|ProjectSummary){
 return 'summaryVersion' in p?p.counts:{evidence:p.evidence.length,usable:p.evidence.filter(e=>!e.excluded&&e.kind!=='synthetic').length,opportunities:p.opportunities.length,drafts:p.opportunities.filter(o=>o.status==='draft'&&!o.stale).length};
}
// A directory read must not downgrade a newer mutation or checkpoint response.
export function mergeProjectSummaries(current:ProjectSummary[],incoming:ProjectSummary[]){
 return incoming.map(next=>{const old=current.find(p=>p.id===next.id);return old&&old.version>next.version?old:next});
}
export function updateProjectSummary(current:ProjectSummary[],next:Project,existingOnly=false){
 const old=current.find(p=>p.id===next.id);if(existingOnly&&!old||old&&old.version>next.version)return current;
 return [toProjectSummary(next),...current.filter(p=>p.id!==next.id)];
}
