import type {Evidence} from './domain';
// Sorting aid only. Zero overlap never excludes a source or proves irrelevance.
export function researchTerms(question:string){
 const clean=question.normalize('NFKC').toLowerCase();const words=clean.match(/[a-z][a-z0-9_-]{2,}/g)||[];
 const chinese=(clean.match(/[\p{Script=Han}]{2,}/gu)||[]).flatMap(run=>Array.from({length:Math.min(run.length-1,100)},(_,i)=>run.slice(i,i+2)));
 const stop=new Set(['the','and','for','with','是否','需要','研究','进行','可以','以及','用户','相关','通过','一个','我们','目前']);
 return [...new Set([...words,...chinese])].filter(t=>!stop.has(t)).slice(0,160);
}
export function rankResearchEvidence(items:Evidence[],question:string){const terms=researchTerms(question);return items.map((item,index)=>{const title=item.title.toLowerCase(),text=item.text.toLowerCase();return {item,index,score:terms.reduce((n,t)=>n+(title.includes(t)?2:text.includes(t)?1:0),0)}}).sort((a,b)=>b.score-a.score||a.index-b.index).map(r=>r.item);}
export function searchFocusWarnings(queries:string[]){return queries.filter(q=>/^(?:saas|ai|人工智能|软件|ai agent reliability|saas onboarding knowledge)$/i.test(q.trim())).map(q=>`检索词「${q}」范围较宽；本轮不自动追加请求，需核查是否覆盖目标角色、具体动作和问题后果。`);}
