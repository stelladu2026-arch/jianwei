import type {Evidence} from './domain';

export type RetrievalHit={id:string;title:string;text:string};
const placeholder=/^该(帖子|条目)只有标题/;

// Term overlap on the current project's stored text. This is not an embedding or an external vector index.
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
