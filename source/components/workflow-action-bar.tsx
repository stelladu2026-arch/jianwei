'use client';
import type {ReactNode} from 'react';
export function WorkflowActionBar({primary,stop,more}:{primary?:ReactNode;stop?:ReactNode;more?:ReactNode}){
 return <div className="run-actions checkpoint-actions" role="group" aria-label="本轮研究操作">
  <div className="checkpoint-action-row"><div className="checkpoint-primary-actions" role="group" aria-label="推进当前流程">{primary}</div><div className="checkpoint-stop-actions" role="group" aria-label="暂停或结束本轮">{stop}</div></div>
  {more&&<details className="checkpoint-more-actions"><summary>更多执行选项</summary><div className="checkpoint-extra-buttons">{more}</div></details>}
 </div>;
}
