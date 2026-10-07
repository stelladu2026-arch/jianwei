import {Annotation, END, START, StateGraph} from '@langchain/langgraph/web';
import type {Evidence} from './domain';
import type {Analysis} from './execution';
import type {ModelResult,ModelTask} from './model-port';
import {collectHN,collectZhWiki,readHNItem,SOURCE_REQUEST_CAP,type Collection} from './collection';
import {literalQuoteStart} from './collaboration';
import {validateResult} from './execution';

// LangGraph must not phone home. This process does not send traces.
if(typeof process!=='undefined'&&process.env){process.env.LANGCHAIN_TRACING_V2='false';process.env.LANGSMITH_TRACING='false';process.env.LANGCHAIN_CALLBACKS_BACKGROUND='false';}

export const AGENT_RUNTIME='@langchain/langgraph';
export const AGENT_TOOLS=['hacker_news_search','hacker_news_read','zh_wikipedia_extract','retrieve_project_evidence'] as const;
export type AgentToolName=(typeof AGENT_TOOLS)[number];
export type AgentToolCall={name:string;arguments:{query:string;id:string}};
export type AgentToolTrace={name:string;status:'executed'|'refused';reason:string;requests:number};
export type RetrievalHit={id:string;title:string;text:string};
export type AgentSpend={extraModelCalls:number;sourceAttempts:number;searches:number;trace:AgentToolTrace[];collections:Collection[];retrieval:RetrievalHit[];fetchedQueries:string[]};
export class AgentToolCalls extends Error{calls:AgentToolCall[];constructor(calls:AgentToolCall[]){super('AGENT_TOOL_CALLS');this.calls=calls;}}
export class AgentStepFailure extends Error{spend:AgentSpend;constructor(message:string,spend:AgentSpend){super(message);this.spend=spend;}}

const UNSEARCHABLE=/payment|invoice|billing|\bbills?\b|interview|geographic|representativeness|付款|付费|账单|访谈|地域代表性/i;
const placeholder=/^该(帖子|条目)只有标题/;

export function parseToolCalls(raw:unknown):AgentToolCall[]{
  if(!Array.isArray(raw))throw new Error('INVALID_MODEL_OUTPUT');
  if(raw.length>2)throw new Error('INVALID_MODEL_OUTPUT');
  return raw.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('INVALID_MODEL_OUTPUT');
    const name=(item as {name?:unknown}).name,args=(item as {arguments?:unknown}).arguments;
    if(typeof name!=='string'||!args||typeof args!=='object'||Array.isArray(args))throw new Error('INVALID_MODEL_OUTPUT');
    const query=(args as {query?:unknown}).query,id=(args as {id?:unknown}).id;
    if(typeof query!=='string'||typeof id!=='string'||query.length>160||id.length>12)throw new Error('INVALID_MODEL_OUTPUT');
    return {name,arguments:{query,id}};
  });
}

export function retrieveProjectEvidence(evidence:Evidence[],question:string):RetrievalHit[]{
  const tokens=question.toLowerCase().split(/[\s,，。；;]+/).map(token=>token.trim()).filter(token=>token.length>=2);
  if(!tokens.length)return [];
  return evidence.filter(item=>!item.excluded&&item.kind!=='synthetic'&&item.text.length>=40&&!placeholder.test(item.text)).map(item=>{
    const hay=`${item.title}\n${item.text}`.toLowerCase();
    return {item,score:tokens.reduce((n,token)=>n+(hay.includes(token)?1:0),0)};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id)).slice(0,4).map(row=>({id:row.item.id,title:row.item.title.slice(0,150),text:row.item.text.slice(0,400)}));
}

export function formatProjectRetrieval(hits:RetrievalHit[]){
  if(!hits.length)return '';
  return '本项目语料检索（词面重叠，不是语义检索质量结论）。以下片段只来自当前项目已保存的原文。引用必须是这些原文里的连续切片；原文可以引用，但不是已核实的市场事实。\n'+hits.map(hit=>`[${hit.id}] ${hit.title}\n${hit.text}`).join('\n');
}

export function assertLiteralCitations(citations:Analysis['citations'],evidence:{id:string;text:string}[],diagnose?:(issues:string[])=>void){
  if(!citations?.length)return;
  const issues:string[]=[];
  citations.forEach((citation,index)=>{
    const source=evidence.find(item=>item.id===citation.evidence_id);
    if(literalQuoteStart(source?.text,citation.quote)<0)issues.push(`data.citations.${index}.quote:not_in_input`);
  });
  if(issues.length){diagnose?.(issues);throw new Error('INVALID_EVIDENCE_QUOTE');}
}

type Turn={final:ModelResult|null;toolCalls:AgentToolCall[]};
type LoopInput={
  task:ModelTask;
  invoke:(task:ModelTask)=>Promise<Turn>;
  evidence:Evidence[];
  since:number|null;
  allowFollowUp:boolean;
  budget:{modelLimit:2|4;modelAttempts:number;sourceLimit:number;sourceAttempts:number;searchLimit:number;searches:number;paidBudget:0};
};

function emptySpend():AgentSpend{return {extraModelCalls:0,sourceAttempts:0,searches:0,trace:[],collections:[],retrieval:[],fetchedQueries:[]};}

function refuse(spend:AgentSpend,name:string,reason:string):AgentToolTrace{const row:AgentToolTrace={name,status:'refused',reason,requests:0};spend.trace.push(row);return row;}

async function executeTool(call:AgentToolCall,input:LoopInput,spend:AgentSpend){
  const name=call.name,query=call.arguments.query.trim(),id=call.arguments.id.trim();
  if(!AGENT_TOOLS.includes(name as AgentToolName))return refuse(spend,name,'TOOL_NOT_ALLOWLISTED');
  if(UNSEARCHABLE.test(query)||UNSEARCHABLE.test(id))return refuse(spend,name,'UNSEARCHABLE');
  if(/https?:|www\./i.test(query))return refuse(spend,name,'TOOL_URL');
  if(input.budget.paidBudget!==0)return refuse(spend,name,'PAID_BUDGET');
  if(name==='retrieve_project_evidence'){
    const hits=retrieveProjectEvidence(input.evidence,query);
    spend.retrieval.push(...hits.filter(hit=>!spend.retrieval.some(old=>old.id===hit.id)));
    spend.trace.push({name,status:'executed',reason:'',requests:0});
    return;
  }
  if(name==='hacker_news_read'&&!/^\d{1,12}$/.test(id))return refuse(spend,name,'TOOL_ID');
  if(!query&&name!=='hacker_news_read')return refuse(spend,name,'TOOL_QUERY');
  const room=input.budget.sourceAttempts+spend.sourceAttempts;
  if(room+SOURCE_REQUEST_CAP>input.budget.sourceLimit)return refuse(spend,name,'SOURCE_BUDGET');
  if(input.budget.searches+spend.searches>=input.budget.searchLimit)return refuse(spend,name,'SEARCH_BUDGET');
  spend.sourceAttempts+=SOURCE_REQUEST_CAP;spend.searches+=1;
  const collection=name==='hacker_news_search'?await collectHN(query,input.since,Math.max(0,SOURCE_REQUEST_CAP-3)):name==='hacker_news_read'?await readHNItem(id,input.since):await collectZhWiki(query,input.since);
  spend.sourceAttempts-=SOURCE_REQUEST_CAP-collection.requests;
  spend.collections.push(collection);
  if(query)spend.fetchedQueries.push(query);
  spend.trace.push({name,status:'executed',reason:'',requests:collection.requests});
}

function withRetrieval(task:ModelTask,hits:RetrievalHit[]):ModelTask{
  if(!hits.length)return task;
  const next=structuredClone(task);
  next.context=next.context||{rules:[],memories:[],prior_results:[],simulation:false,attempt:1,scenario:'normal'};
  next.context.rules=[...next.context.rules,formatProjectRetrieval(hits)];
  const known=new Set(next.evidence_ids);
  for(const hit of hits){if(!known.has(hit.id)){known.add(hit.id);next.evidence_ids.push(hit.id);next.evidence.push({id:hit.id,title:hit.title,text:hit.text});}}
  return next;
}

export async function runSingleRoleAgent(input:LoopInput){
  const spend=emptySpend();
  let failure:Error|undefined;
  let finalBody:ModelResult|null=null;
  let turn=0;
  const State=Annotation.Root({
    pending:Annotation<AgentToolCall[]>({reducer:(_left,right)=>right,default:()=>[]}),
    hasFinal:Annotation<boolean>({reducer:(_left,right)=>right,default:()=>false}),
    modelAttempts:Annotation<number>({reducer:(_left,right)=>right,default:()=>input.budget.modelAttempts}),
  });
  const modelNode=async(state:typeof State.State)=>{
    if(turn>0){
      if(state.modelAttempts>=input.budget.modelLimit){spend.trace.push({name:'model',status:'refused',reason:'MODEL_BUDGET',requests:0});return {pending:[],hasFinal:state.hasFinal};}
      spend.extraModelCalls+=1;
      state={...state,modelAttempts:state.modelAttempts+1};
    }
    turn+=1;
    try{
      const outcome=await input.invoke(withRetrieval(input.task,spend.retrieval));
      if(outcome.final)finalBody=outcome.final;
      return {pending:outcome.toolCalls,hasFinal:!!outcome.final,modelAttempts:state.modelAttempts};
    }catch(error){failure=error instanceof Error?error:new Error('MODEL_REPORTED_ERROR');return {pending:[],hasFinal:false,modelAttempts:state.modelAttempts};}
  };
  const toolsNode=async(state:typeof State.State)=>{
    try{for(const call of state.pending)await executeTool(call,input,spend);}
    catch(error){failure=error instanceof Error?error:new Error('MODEL_REPORTED_ERROR');}
    if(!failure&&!state.hasFinal&&input.allowFollowUp&&state.modelAttempts>=input.budget.modelLimit)spend.trace.push({name:'model',status:'refused',reason:'MODEL_BUDGET',requests:0});
    return {pending:[] as AgentToolCall[],hasFinal:failure?true:state.hasFinal};
  };
  const graph=new StateGraph(State)
    .addNode('model',modelNode)
    .addNode('tools',toolsNode)
    .addEdge(START,'model')
    .addConditionalEdges('model',state=>state.pending.length?'tools':END)
    .addConditionalEdges('tools',state=>!state.hasFinal&&input.allowFollowUp&&state.modelAttempts<input.budget.modelLimit?'model':END)
    .compile();
  await graph.invoke({pending:[],hasFinal:false,modelAttempts:input.budget.modelAttempts},{recursionLimit:8});
  if(failure)throw new AgentStepFailure(failure.message,spend);
  return {runtime:AGENT_RUNTIME,final:finalBody,spend};
}

export function acceptAgentFinal(raw:ModelResult,task:ModelTask,diagnose?:(issues:string[])=>void){
  const {agentToolCalls:_ignored,...body}=raw as ModelResult&{agentToolCalls?:AgentToolCall[]};
  const result=validateResult(body,task,diagnose);
  assertLiteralCitations(result.data.citations,task.evidence as {id:string;text:string}[],diagnose);
  return result;
}
