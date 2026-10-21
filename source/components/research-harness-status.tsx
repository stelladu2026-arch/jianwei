'use client';
import {useEffect,useState} from 'react';
import {requestJSON} from '@/lib/research/browser-api';
import type {HarnessStatus} from '@/lib/research/harness/status';

export function ResearchHarnessStatus({projectId,projectVersion}:{projectId:string;projectVersion:number}){
  const [state,setState]=useState<{projectId:string;value:HarnessStatus|null;error:string}>({projectId,value:null,error:''});
  useEffect(()=>{
    let disposed=false;
    requestJSON<HarnessStatus&{enabled:boolean}>(`/api/projects/${encodeURIComponent(projectId)}/harness`).then(value=>{
      if(!disposed)setState({projectId,value:value.enabled?value:null,error:''});
    }).catch(()=>{if(!disposed)setState({projectId,value:null,error:'执行记录暂未读取成功，刷新项目后重试。'})});
    return()=>{disposed=true};
  },[projectId,projectVersion]);
  const current=state.projectId===projectId?state:null;
  return <section className="panel" aria-label="执行保障">
    <h3>执行保障</h3>
    <p className="meta">研究范围、证据、角色权限与请求上限共同约束本轮执行。已确认的操作结果会保存，结果不明的请求不会自动重发。</p>
    {current?.value?<>
      <div className="budget-row"><span>已保存执行检查点</span><strong>{current.value.checkpoints}</strong></div>
      <div className="budget-row"><span>已确认完成的操作</span><strong>{current.value.completedOperations}</strong></div>
      <div className="budget-row"><span>等待结果确认的操作</span><strong>{current.value.unfinishedOperations+current.value.uncertainOperations}</strong></div>
      {current.value.uncertainOperations>0?<p className="warning-text" role="status">部分请求结果不明，已阻止自动重复调用。请先核查原请求与服务用量。</p>:null}
    </>:<p className="meta" role="status">{current?.error||'正在读取执行记录…'}</p>}
  </section>;
}
