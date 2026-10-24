import {executeModel} from './execution';
import {AgentToolCalls,parseToolCalls,type AgentToolCall} from './agent-loop';
import type {ModelResult,ModelTask,ResearchModelAdapter} from './model-port';

type TurnReceipt={requestId?:string;usage?:ModelResult['usage']};
type Adapter=ResearchModelAdapter&{receipt?:TurnReceipt};
export type AgentModelTurn={final:ModelResult|null;toolCalls:AgentToolCall[];receipt:TurnReceipt};

// Both provider return forms cross the same boundary in production and live
// acceptance. A provisional analysis must never hide an attached tool request.
export async function executeAgentTurn(task:ModelTask,adapter:Adapter,timeoutMs:number):Promise<AgentModelTurn>{
  const receipt=()=>structuredClone(adapter.receipt||{});
  try{
    const result=await executeModel(task,adapter,timeoutMs);
    const {agentToolCalls,...final}=result as ModelResult&{agentToolCalls?:unknown};
    return {final,toolCalls:agentToolCalls===undefined?[]:parseToolCalls(agentToolCalls),receipt:receipt()};
  }catch(error){
    if(error instanceof AgentToolCalls)return {final:null,toolCalls:parseToolCalls(error.calls),receipt:receipt()};
    throw error;
  }
}
