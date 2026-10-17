import type {Project} from './domain';
// A background checkpoint read must never replace a newer mutation response.
export function mergeProjectUpdate(projects:Project[],next:Project){
 const current=projects.find(p=>p.id===next.id);
 return current&&current.version>next.version?projects:[next,...projects.filter(p=>p.id!==next.id)];
}
// A checkpoint cannot recreate a project removed while its request was pending.
export function mergeExistingProjectUpdate(projects:Project[],next:Project){
 return projects.some(p=>p.id===next.id)?mergeProjectUpdate(projects,next):projects;
}
