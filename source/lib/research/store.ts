import {env} from '@/lib/deployment/runtime-env';
import {storageOperation} from './storage-errors';
import type {Project} from './domain';
export function db(){if(!env.DB)throw new Error('研究数据暂时不可用，请稍后重试。');return env.DB;}
export async function list(){const r=await storageOperation(false,()=>db().prepare('SELECT payload FROM research_projects ORDER BY updated DESC LIMIT 100').all<{payload:string}>());return r.results.map(x=>JSON.parse(x.payload) as Project);}
export async function get(id:string){const r=await storageOperation(false,()=>db().prepare('SELECT payload FROM research_projects WHERE id = ?').bind(id).first<{payload:string}>());return r?JSON.parse(r.payload) as Project:null;}
export async function create(p:Project){await storageOperation(true,()=>db().prepare('INSERT INTO research_projects (id,version,payload,updated) VALUES (?,?,?,?)').bind(p.id,p.version,JSON.stringify(p),p.updated).run());return p;}
export async function save(p:Project,expected:number){p.version=expected+1;p.updated=new Date().toISOString();const payload=JSON.stringify(p);if(payload.length>600000)throw new Error('项目资料已达到本版容量，请导出后新建项目。');const r=await storageOperation(true,()=>db().prepare('UPDATE research_projects SET version=?, payload=?, updated=? WHERE id=? AND version=?').bind(p.version,payload,p.updated,p.id,expected).run());if(!r.meta.changes)throw new Error('VERSION_CONFLICT');return p;}
