import type {Evidence} from './domain';
export function developmentArtifact(title:string,text:string){const all=title+'\n'+text;return /(?:server (?:execution )?mission|\[v\d+\].*(?:原型|prototype)|(?:daily|weekly) (?:tech|ecosystem|report)|bản tin|借鉴.*能力增强)/i.test(title)||/(?:##?\s*(?:目标|验收|交付|implementation|high-level design|prerequisite)|仅改.{0,30}frontend|只使用内存模拟数据|所有任务.{0,50}均为模拟数据|frontend-v\d)/i.test(all)&&/(?:原型|模拟数据|任务交付|总事项|不接后端|implementation|验收标准|必须实现)/i.test(all);}
export type ResearchScope={title?:string;audience?:string;exclusions?:string};
export function sourceFit(e:Pick<Evidence,'kind'|'title'|'text'|'url'>,scope:string|ResearchScope){
 const topic=typeof scope==='string'?scope:[scope.title,scope.audience].filter(Boolean).join(' ');
 const excluded=typeof scope==='string'?'':scope.exclusions||'';
 if(e.kind!=='public')return {allowed:true,reason:''};
 if(developmentArtifact(e.title,e.text))return {allowed:false,reason:'开发任务、原型交付或资讯汇总，暂不纳入需求分析；不是用户使用经历。'};
 const productWords=(text:string)=>[...text.matchAll(/\b(n8n|dify|cloudflare|discourse)\b/gi)].map(m=>m[1].toLowerCase());
 let address='';try{address=new URL(e.url).pathname.toLowerCase();}catch{}
 if(productWords(excluded).some(product=>address.includes(product)||e.title.toLowerCase().includes(product)))return {allowed:false,reason:'资料属于研究范围明确排除的产品，暂不纳入分析。'};
 const products=[...topic.matchAll(/\b(n8n|dify|cloudflare|discourse)\b/gi)].map(m=>m[1].toLowerCase());if(!products.length)return {allowed:true,reason:''};
 let u:URL;try{u=new URL(e.url);}catch{return {allowed:true,reason:''};}
 if(u.hostname==='github.com'){const parts=u.pathname.split('/').filter(Boolean),repo=parts[1]?.toLowerCase()||'';const title=e.title.toLowerCase();if(!products.some(product=>repo.includes(product)||title.includes(product)))return {allowed:false,reason:'来自其他产品仓库，仅正文提及研究产品，相关性需人工核查；暂不纳入需求分析。'};}
 return {allowed:true,reason:''};
}
