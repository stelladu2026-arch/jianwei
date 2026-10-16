import {z} from 'zod';
import {log,type Opportunity,type Project} from './domain';
const text=z.string().max(8000);
const schema=z.object({id:z.string().max(200),sourceRunId:z.string().min(1).max(200).optional(),title:z.string().trim().min(1).max(200),problem:text,audience:text,alternative:text,conclusion:text,decision:z.enum(['validate','evidence','pause']),payment:z.enum(['none','weak','medium','strong']),refs:z.array(z.string()).max(30),counter:text,unknowns:text,plan:text});
const fields=['title','problem','audience','alternative','conclusion','decision','payment','counter','unknowns','plan'] as const;
function sameContent(a:Opportunity,b:z.infer<typeof schema>){return fields.every(k=>a[k].trim()===b[k].trim())&&JSON.stringify([...new Set(a.refs)].sort())===JSON.stringify([...new Set(b.refs)].sort());}
export function saveConfirmedOpportunity(p:Project,data:unknown){
 const o=schema.parse(data);
 if(o.refs.some(ref=>!p.evidence.some(e=>e.id===ref&&!e.excluded)))throw new Error('引用必须来自本项目未排除的资料。');
 if(o.payment==='strong')throw new Error('本版未接入可核实的交易资料，不支持标记为强付费信号。');
 let previous=o.id?p.opportunities.find(x=>x.id===o.id):undefined;
 if(o.id&&!previous)throw new Error('这张机会卡已删除或不存在，请关闭编辑窗口并刷新项目。');
 if(previous?.sourceRunId&&o.sourceRunId&&previous.sourceRunId!==o.sourceRunId)throw new Error('机会卡与研究结论不匹配，请刷新项目。');
 const sourceRunId=previous?.sourceRunId||o.sourceRunId;
 let sourceEvidenceVersion=previous?.sourceEvidenceVersion;
 if(sourceRunId&&!previous){
  const run=[p.workflow?.analysisRun,p.run,...(p.runHistory||[]),...(p.workflowHistory||[]).map(w=>w.analysisRun)].find(x=>x?.id===sourceRunId);
  if(!run||run.status!=='completed'||run.simulation||run.conclusionReview||run.revision!==p.revision||run.evidenceVersion!==(p.evidenceVersion||0))throw new Error('研究结论已过期或不可用，请先在当前范围重新核查。');
  previous=p.opportunities.find(x=>x.sourceRunId===sourceRunId);
  sourceEvidenceVersion=run.evidenceVersion;
 }
 // A repeated create with a new request ID still updates the same exact manual judgement.
 // Different hypotheses in the same project remain separate cards.
 if(!previous&&!sourceRunId)previous=p.opportunities.find(x=>!x.sourceRunId&&sameContent(x,o));
 if(!previous&&p.opportunities.length>=100)throw new Error('本版每个项目最多 100 张机会卡，请先删除不再需要的卡片。');
 const item:Opportunity={...o,id:previous?.id||crypto.randomUUID(),refs:[...new Set(o.refs)],stale:false,revision:p.revision,status:'confirmed',...(sourceRunId?{sourceRunId,sourceEvidenceVersion}:{})};
 const i=p.opportunities.findIndex(x=>x.id===item.id);
 if(i<0)p.opportunities.push(item);else p.opportunities[i]=item;
 if(sourceRunId)p.removedOpportunityRunIds=p.removedOpportunityRunIds?.filter(id=>id!==sourceRunId);
 log(p,'保存人工机会判断；不代表已验证事实');
 return item.id;
}
export function removeOpportunity(p:Project,data:unknown){
 const id=z.string().min(1).max(200).parse(data),item=p.opportunities.find(x=>x.id===id);
 if(item?.sourceRunId)p.removedOpportunityRunIds=[...new Set([...(p.removedOpportunityRunIds||[]),item.sourceRunId])];
 p.opportunities=p.opportunities.filter(x=>x.id!==id);
 log(p,'删除机会卡；原文与历史报告快照保留');
}
