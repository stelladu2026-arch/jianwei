import type {ResearchWorkflow} from './workflow';

export function workflowModelUsage(w:Pick<ResearchWorkflow,'records'|'budget'>){
 const stages=w.records.filter(r=>r.kind==='model').map(r=>{
  const receipts=r.agentModelReceipts??[{usage:r.usage}],known=receipts.filter(c=>c.usage);
  return {id:r.id,stage:r.stage,attempts:Math.max(1,receipts.length),receipts:known.length,input:known.reduce((n,c)=>n+c.usage!.input_tokens,0),output:known.reduce((n,c)=>n+c.usage!.output_tokens,0)};
 });
 const receipts=stages.reduce((n,s)=>n+s.receipts,0);
 return {attempts:w.budget.modelAttempts,limit:w.budget.modelLimit,receipts,input:stages.reduce((n,s)=>n+s.input,0),output:stages.reduce((n,s)=>n+s.output,0),unknown:Math.max(0,w.budget.modelAttempts-receipts),stages};
}
export function modelStopReason(code:string,budget:{attempts:number;limit:number}){
 if(code!=='MODEL_BUDGET'&&code!=='MODEL_STAGE_BUDGET')return '';
 const {attempts,limit}=budget;
 const count=`本轮已用 ${attempts} / ${limit} 次模型请求（包含工具后的模型调用）`;
 return attempts>=limit?`${count}，已达到应用设定的本轮次数上限；这不代表账户余额或免费额度已耗尽`:
  code==='MODEL_STAGE_BUDGET'?`${count}；当前阶段已达到分配上限，剩余请求为后续分析保留，不能追加当前阶段`:
  `${count}；该工具循环未能在分配次数内完成，请核对执行明细；不能据此判断账户额度已耗尽`;
}
