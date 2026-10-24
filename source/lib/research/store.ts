import {env} from '@/lib/deployment/runtime-env';
import {storageOperation} from './storage-errors';
import type {Project} from './domain';
import type {ProjectSummary} from './project-summary';
export function db(){if(!env.DB)throw new Error('研究数据暂时不可用，请稍后重试。');return env.DB;}
export async function list(){const r=await storageOperation(false,()=>db().prepare('SELECT payload FROM research_projects ORDER BY updated DESC LIMIT 100').all<{payload:string}>());return r.results.map(x=>JSON.parse(x.payload) as Project);}
function checkpointSQL(path:string){return `CASE WHEN json_type(payload,'${path}')='object' THEN json_object('status',json_extract(payload,'${path}.status'),'revision',json_extract(payload,'${path}.revision'),'evidenceVersion',json_extract(payload,'${path}.evidenceVersion'),'created',json_extract(payload,'${path}.created'),'lease',CASE WHEN json_type(payload,'${path}.lease')='object' THEN json_object('expires',json_extract(payload,'${path}.lease.expires')) ELSE NULL END) ELSE NULL END`;}
// Project bodies stay in the database. The overview never transfers originals,
// snapshots, model traces or historical reports over the SQL HTTP connection.
export async function listSummaries(){
 const flow=checkpointSQL('$.workflow'),audit=checkpointSQL('$.workflow.conclusionAudit');
 const query=`SELECT json_object('summaryVersion',1,'id',id,'version',version,'revision',json_extract(payload,'$.revision'),'title',json_extract(payload,'$.title'),'audience',json_extract(payload,'$.audience'),'mode',json_extract(payload,'$.mode'),'status',json_extract(payload,'$.status'),'archived',json_extract(payload,'$.archived'),'confirmed',json_extract(payload,'$.confirmed'),'evidenceVersion',json_extract(payload,'$.evidenceVersion'),'created',json_extract(payload,'$.created'),'updated',updated,
 'counts',json_object('evidence',COALESCE(json_array_length(payload,'$.evidence'),0),'usable',(SELECT count(*) FROM json_each(payload,'$.evidence') WHERE COALESCE(json_extract(value,'$.excluded'),0)=0 AND json_extract(value,'$.kind')!='synthetic'),'opportunities',COALESCE(json_array_length(payload,'$.opportunities'),0),'drafts',(SELECT count(*) FROM json_each(payload,'$.opportunities') WHERE json_extract(value,'$.status')='draft' AND COALESCE(json_extract(value,'$.stale'),0)=0)),
 'workflow',CASE WHEN json_type(payload,'$.workflow')='object' THEN json_patch(${flow},json_object('conclusionAudit',${audit})) ELSE NULL END,'run',${checkpointSQL('$.run')}) AS summary FROM research_projects ORDER BY updated DESC LIMIT 100`;
 const rows=await storageOperation(false,()=>db().prepare(query).all<{summary:string}>());
 return rows.results.map(row=>{const p=JSON.parse(row.summary);p.archived=!!p.archived;p.confirmed=!!p.confirmed;if(!p.workflow)delete p.workflow;if(!p.run)delete p.run;for(const c of [p.workflow,p.workflow?.conclusionAudit,p.run])if(c&&!c.lease)delete c.lease;return p as ProjectSummary});
}
export async function get(id:string){const r=await storageOperation(false,()=>db().prepare('SELECT payload FROM research_projects WHERE id = ?').bind(id).first<{payload:string}>());return r?JSON.parse(r.payload) as Project:null;}
export async function create(p:Project){await storageOperation(true,()=>db().prepare('INSERT INTO research_projects (id,version,payload,updated) VALUES (?,?,?,?)').bind(p.id,p.version,JSON.stringify(p),p.updated).run());return p;}
export async function save(p:Project,expected:number){p.version=expected+1;p.updated=new Date().toISOString();const payload=JSON.stringify(p);if(payload.length>600000)throw new Error('项目资料已达到本版容量，请导出后新建项目。');const r=await storageOperation(true,()=>db().prepare('UPDATE research_projects SET version=?, payload=?, updated=? WHERE id=? AND version=?').bind(p.version,payload,p.updated,p.id,expected).run());if(!r.meta.changes)throw new Error('VERSION_CONFLICT');return p;}
