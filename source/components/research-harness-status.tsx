'use client';
import {useEffect,useState} from 'react';
import {requestJSON} from '@/lib/research/browser-api';
import type {HarnessStatus} from '@/lib/research/harness/status';
type Status=HarnessStatus&{enabled:boolean;active?:boolean;recovery?:{allowed:boolean;reason:string};background?:{runId:string;state:string;message:string;active?:boolean}|null};
export function ResearchHarnessStatus({projectId,projectVersion,busy=false,onRecover,onBackground,onRefresh}:{projectId:string;projectVersion:number;busy?:boolean;onRecover?:()=>void;onBackground?:()=>void;onRefresh?:()=>Promise<unknown>}){
 const [state,setState]=useState<{projectId:string;value:Status|null;error:string}>({projectId,value:null,error:''});
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let disposed=false,inflight=false,polling=true;async function read(){if(inflight)return;inflight=true;try{const value=await requestJSON<Status>(`/api/projects/${encodeURIComponent(projectId)}/harness`);if(disposed)return;polling=!!value.active||['ready','running'].includes(value.background?.state||'');setState({projectId,value,error:''});if(value.background)await onRefresh?.();}catch{if(!disposed)setState({projectId,value:null,error:'执行记录暂未读取成功，请刷新后重试。'});}finally{inflight=false;}}
  void read();const timer=setInterval(()=>{if(polling)void read()},3000);return()=>{disposed=true;clearInterval(timer)};
 },[projectId,projectVersion,refresh]);
 const current=state.projectId===projectId?state:null,value=current?.value;
 return <section className="panel" aria-label="执行保障"><div className="spread"><h3>执行保障</h3><button className="button subtle" disabled={busy} onClick={()=>setRefresh(x=>x+1)}>刷新执行记录</button></div>
  <p className="meta">已确认的操作结果会保存；结果不明的请求不会自动重发。后台推进沿用本轮原始上限，关闭页面后可继续执行。</p>
  {value?.enabled?<>
   <div className="budget-row"><span>已保存执行检查点</span><strong>{value.checkpoints}</strong></div>
   <div className="budget-row"><span>已确认完成的操作</span><strong>{value.completedOperations}</strong></div>
   <div className="budget-row"><span>等待结果确认的操作</span><strong>{value.unfinishedOperations+value.uncertainOperations}</strong></div>
   {value.background?<p className="meta" role="status">{value.background.message}</p>:null}
   {value.recovery?.allowed?<div><p className="meta">{value.recovery.reason}</p><button className="button primary" disabled={busy} onClick={onRecover}>从已确认检查点恢复</button></div>:value.recovery?.reason?<p className="meta">{value.recovery.reason}</p>:null}
   {value.uncertainOperations>0||value.unfinishedOperations>0?<p className="warning-text" role="status">有请求结果尚未确认；后台与恢复入口都不会自动重发，请核查服务用量后处理当前轮。</p>:null}
   {onBackground?<button className="button secondary" disabled={busy||value.background?.active===true} onClick={onBackground}>继续后台推进</button>:null}
  </>:<p className="meta" role="status">{current?.error||(value?.enabled===false?'当前研究使用旧版执行记录。':'正在读取执行记录…')}</p>}
 </section>;
}
