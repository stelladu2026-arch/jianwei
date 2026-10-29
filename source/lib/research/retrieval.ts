import {isAnalysisBody} from './evidence-eligibility';
import type {Evidence} from './domain';

export type RetrievalHit={id:string;title:string;text:string;mode?:'hybrid';score?:number;coverage?:{indexed:number;eligible:number};truncated?:boolean};
const placeholder=/^该(帖子|条目)只有标题/;

// Term overlap on the current project's stored text. This is not an embedding or an external vector index.
export function retrieveProjectEvidence(evidence:Evidence[],question:string):RetrievalHit[]{
  const tokens=question.toLowerCase().split(/[\s,，。；;]+/).map(token=>token.trim()).filter(token=>token.length>=2);
  if(!tokens.length)return [];
  return evidence.filter(item=>isAnalysisBody(item)).map(item=>{
    const hay=`${item.title}\n${item.text}`.toLowerCase();
    return {item,score:tokens.reduce((n,token)=>n+(hay.includes(token)?1:0),0)};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id)).slice(0,4).map(row=>({id:row.item.id,title:row.item.title.slice(0,150),text:row.item.text.slice(0,400)}));
}

export function formatProjectRetrieval(hits:RetrievalHit[]){
  if(!hits.length)return '';
  const mode=hits.some(h=>h.mode==='hybrid')?'文本向量与关键词混合检索；只覆盖选定的至多 8 条资料、每条前 900 字符，未命中不代表没有依据，语义质量待人工评测':'词面重叠，不是语义检索质量结论';
  return `本项目语料检索（${mode}）。以下片段只来自当前项目已保存的原文。引用必须是这些原文里的连续切片；原文可以引用，但不是已核实的市场事实。\n`+hits.map(hit=>`[${hit.id}] ${hit.title}\n${hit.text}`).join('\n');
}
