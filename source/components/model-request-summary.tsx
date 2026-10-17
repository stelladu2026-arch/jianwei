'use client';
import type {workflowModelUsage} from '@/lib/research/workflow-usage';
export function ModelRequestSummary({usage,stageNames}:{usage:ReturnType<typeof workflowModelUsage>;stageNames:Record<string,string>}){
 return <>
  <div className="budget-row"><span>本轮模型请求（已用 / 上限）</span><strong>{usage.attempts} / {usage.limit}</strong></div>
  <div className="budget-row"><span>有用量回执的模型请求</span><strong>{usage.receipts} 次</strong></div>
  <div className="budget-row"><span>已知输入 / 输出词元</span><strong>{usage.input} / {usage.output}</strong></div>
  {usage.unknown>0&&<p className="meta">{usage.unknown} 次请求没有用量回执，用量按未知保留。</p>}
  <details><summary>各阶段调用明细</summary>{usage.stages.length?<ul>{usage.stages.map(s=><li key={s.id}>{stageNames[s.stage]||s.stage}：{s.attempts} 次请求，有用量回执 {s.receipts} 次。</li>)}</ul>:<p>尚未发起模型请求。</p>}</details>
  <p className="meta">一个阶段可能包含多次模型请求：模型要求工具后，还需要调用模型读取工具结果。这里显示应用的本轮次数限制，账户余额、服务免费额度和实际账单需在服务账户中核查。</p>
 </>;
}
