import {modelRetryBlock} from './stage-budget';
import type {Project} from './domain';
import {currentRun,failTask,type Run} from './execution';
export function runRetryBlockReason(r:Run){
  if(r.status!=='failed')return '当前没有失败步骤。';
  const t=r.tasks.find(t=>t.status==='failed');
  if(!t||t.attempts>=2)return '该步骤已达到最多两次尝试，请结束本次执行后重新创建。';
  if(t.role&&r.budget.attempts>=r.budget.limit)return '本次调用预算已用尽，请保留记录并结束本次执行。';
  if(t.role&&r.adapter==='qwen'){const reason=modelRetryBlock(t.error);if(reason)return reason;if(r.budget.stageLimit===2&&r.budget.attempts+1+r.tasks.filter(x=>x.role&&x.id!==t.id&&x.status!=='done').length>r.budget.limit)return '剩余额度已为后续阶段保留，不能追加当前阶段。';}
  return '';
}
export function interrupt(r:Run){if(r.lease){const t=r.tasks.find(t=>t.id===r.lease!.taskId)!;t.calls.push({id:r.lease.callId,error:'EXECUTION_INTERRUPTED',elapsedMs:0});t.status=r.adapter==='qwen'?'failed':t.attempts<2?'pending':'failed';t.error='EXECUTION_INTERRUPTED';r.lease=undefined;}}
export function controlRun(p:Project,action:'pause'|'resume'|'cancel'|'retry'|'recover'){
  const r=action==='cancel'?p.run:currentRun(p);if(!r)throw new Error('尚未创建执行任务。');
  if(action==='pause'){if(!['ready','running','failed'].includes(r.status))throw new Error('当前执行不能暂停。');interrupt(r);r.status='paused';}
  if(action==='resume'){if(r.status!=='paused'||p.status==='paused')throw new Error('请先恢复项目，再恢复执行。');r.status=r.tasks.some(t=>t.status==='failed')?'failed':'ready';}
  if(action==='cancel'){if(['completed','cancelled'].includes(r.status))throw new Error('当前执行已结束。');interrupt(r);r.status='cancelled';}
  if(action==='retry'){
    const reason=runRetryBlockReason(r);if(reason)throw new Error(reason);const t=r.tasks.find(t=>t.status==='failed')!;
    t.status='pending';t.error='';r.status='ready';
  }
  if(action==='recover'){
    if(!r.lease||Date.parse(r.lease.expires)>Date.now())throw new Error('步骤仍在执行或没有过期的检查点。');
    const t=r.tasks.find(t=>t.id===r.lease!.taskId)!;failTask(r,t,'EXECUTION_INTERRUPTED',r.lease.callId,0);
  }
  r.updated=new Date().toISOString();return r;
}
