import type {ModelTask} from './model-port';
export const AUDIT_CLAUSE_POLICY='audit-clauses/1';
export const MAX_AUDIT_CLAUSES=12;
type Claim=NonNullable<ModelTask['review_claims']>[number];
// Syntactic segmentation only. Keep exact, contiguous spans, including negation,
// punctuation and conditions. The whole parent remains mandatory context.
export function auditClauses(claims:Claim[]):Claim[]{
 const result:Claim[]=[];
 for(const parent of claims){
  const spans:{start:number;end:number}[]=[];let start=0,depth=0;
  for(let i=0;i<parent.claim.length;i++){
   const c=parent.claim[i];if('（(['.includes(c))depth++;if('）)]'.includes(c))depth=Math.max(0,depth-1);
   if(!depth&&/[，；。！？;!?\n]/.test(c)&&i+1-start>=12&&parent.claim.length-i-1>=12){spans.push({start,end:i+1});start=i+1;}
  }
  spans.push({start,end:parent.claim.length});
  for(const [index,span] of spans.entries())result.push({...parent,target:parent.target+':'+index,claim:parent.claim.slice(span.start,span.end),parent_claim:parent.claim,parent_target:parent.target,start:span.start,end:span.end,refs:[...parent.refs]});
 }
 if(result.length>MAX_AUDIT_CLAUSES)throw Error('待核查分句超过12项，尚未调用模型。请缩小研究范围后重新研究；原检查点和预算保留。');
 return result;
}
export function auditFieldJudgments(checks:{target:string;judgment:string}[],claims:Claim[]){
 const parents=[...new Set(claims.filter(c=>c.parent_target).map(c=>c.parent_target!))];
 return parents.map(target=>{const children=claims.filter(c=>c.parent_target===target),rows=children.map(c=>checks.find(r=>r.target===c.target));
  return {target,total:children.length,supported:rows.filter(r=>r?.judgment==='supports').length,fullySupported:rows.every(r=>r?.judgment==='supports')};
 });
}
