import type {Project} from '../domain';
import type {HarnessDatabase} from './storage';
import {initializeHarnessDatabase} from './storage';

export class BackgroundStateError extends Error{}
export type BackgroundJob={project_id:string;run_id:string;revision:number;request_id:string;token_hash:string;state:string;lease_owner:string|null;lease_until:number;message:string;updated:string};
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function backgroundStatus(db:HarnessDatabase,id:string){
 await initializeHarnessDatabase(db);
 const row=await db.prepare('SELECT * FROM research_harness_jobs WHERE project_id=?').bind(id).first<BackgroundJob>();
 return row?{runId:row.run_id,state:row.state,message:row.message,updated:row.updated,leaseUntil:row.lease_until,active:row.state==='running'&&row.lease_until>Date.now()}:null;
}
export async function queueBackground(db:HarnessDatabase,p:Project,requestId:string){
 const w=p.workflow;
 if(!w?.harnessVersion||w.status!=='ready'||w.lease||!p.confirmed||p.archived||p.mode!=='manual'||['paused','completed','cancelled'].includes(p.status)||w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0))throw new BackgroundStateError('当前研究不能开始后台推进，请先处理检查点。');
 await initializeHarnessDatabase(db);
 const old=await db.prepare('SELECT request_id FROM research_harness_jobs WHERE project_id=?').bind(p.id).first<{request_id:string}>();
 if(old?.request_id===requestId)return null;
 const ticket=crypto.randomUUID()+crypto.randomUUID(),token=await hash(ticket),now=Date.now();
 const result=await db.prepare("INSERT INTO research_harness_jobs (project_id,run_id,revision,request_id,token_hash,state,lease_until,message,updated) VALUES (?,?,?,?,?,'ready',0,'等待后台执行',?) ON CONFLICT(project_id) DO UPDATE SET run_id=excluded.run_id,revision=excluded.revision,request_id=excluded.request_id,token_hash=excluded.token_hash,state='ready',lease_owner=NULL,lease_until=0,message=excluded.message,updated=excluded.updated WHERE research_harness_jobs.run_id!=excluded.run_id OR research_harness_jobs.state!='running' OR research_harness_jobs.lease_until<?").bind(p.id,w.id,p.revision,requestId,token,new Date().toISOString(),now).run();
 if(!result.meta.changes)throw new BackgroundStateError('已有后台任务正在推进，请等待或暂停研究。');
 return ticket;
}
export async function runBackground(options:{db:HarnessDatabase;projectId:string;ticket:string;get:(id:string)=>Promise<Project|null>;advance:(p:Project)=>Promise<void>;kick?:(ticket:string)=>Promise<boolean>;durationMs?:number;now?:()=>number}){
 const {db,projectId,ticket}=options,now=options.now||Date.now,owner=crypto.randomUUID(),token=await hash(ticket),started=now(),deadline=started+(options.durationMs??240000);
 const claim=await db.prepare("UPDATE research_harness_jobs SET state='running',lease_owner=?,lease_until=?,updated=? WHERE project_id=? AND token_hash=? AND (state='ready' OR (state='running' AND lease_until<?))").bind(owner,started+295000,new Date().toISOString(),projectId,token,started).run();
 if(!claim.meta.changes)return;
 const finish=async(state:string,message:string)=>{await db.prepare('UPDATE research_harness_jobs SET state=?,message=?,lease_owner=NULL,lease_until=0,updated=? WHERE project_id=? AND token_hash=? AND lease_owner=?').bind(state,message,new Date().toISOString(),projectId,token,owner).run();};
 try{
  for(let steps=0;steps<18;steps++){
   const job=await db.prepare('SELECT * FROM research_harness_jobs WHERE project_id=?').bind(projectId).first<BackgroundJob>();
   if(job?.lease_owner!==owner||job.token_hash!==token)return;
   const p=await options.get(projectId),w=p?.workflow;
   if(!p||!w||w.id!==job.run_id||p.revision!==job.revision||w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0)||!p.confirmed||p.archived||['paused','cancelled','completed'].includes(p.status)){await finish('stopped','项目或研究范围已变化，后台已停止。');return;}
   if(['completed','partial'].includes(w.status)){await finish('completed','本轮后台推进已结束，请查看成果与证据缺口。');return;}
   if(w.status!=='ready'||w.lease){await finish('attention','当前检查点需要处理；后台不会自动重试失败或结果不明的请求。');return;}
   const model=['plan','analyze','gap','reanalyze','needs','commercial','verifier','synthesis'].includes(w.stage);
   const reserveMs=model?(w.mode==='four'?65000:115000):['collect','supplement'].includes(w.stage)?60000:5000;
   if(deadline-now()<reserveMs)break;
   await options.advance(p);
  }
  await finish('ready','进度已保存，等待下一段后台推进。');
  if(!await options.kick?.(ticket))await db.prepare("UPDATE research_harness_jobs SET state='attention',message='自动接力未确认，请点击继续后台推进；不会重复运行失败步骤。' WHERE project_id=? AND token_hash=? AND state='ready'").bind(projectId,token).run();
 }catch{await finish('attention','后台推进中断，已有结果保留。请刷新检查点并选择恢复方式。');}
}
