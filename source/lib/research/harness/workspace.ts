import type {ModelTask} from '../model-port';
import type {Evidence} from '../domain';

export function evidenceWorkspace(task:ModelTask,evidence:Evidence[]){
  const allowed=new Set(task.evidence_ids);
  const files:Record<string,{content:string;mimeType:string;created_at:string;modified_at:string}>={};
  const add=(path:string,content:string)=>{files[path]={content,mimeType:'text/plain',created_at:'2000-01-01T00:00:00.000Z',modified_at:'2000-01-01T00:00:00.000Z'}};
  add('/research/brief.json',JSON.stringify(task.brief));
  // Use indices for virtual paths: evidence IDs are data, never path names.
  task.evidence.filter((item):item is {id:string;text:string}=>!!item&&typeof item==='object'&&typeof (item as {id?:unknown}).id==='string'&&typeof (item as {text?:unknown}).text==='string').forEach((item,i)=>{
    if(allowed.has(item.id)&&evidence.some(e=>e.id===item.id&&!e.excluded))add(`/research/evidence/${i}.json`,JSON.stringify(item));
  });
  add('/research/memory.json',JSON.stringify(task.role==='verifier'?[]:task.context?.memories||[]));
  return files;
}
