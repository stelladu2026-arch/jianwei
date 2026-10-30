import type {Evidence} from './domain';
// Conservative implementation-task signals shared by hints and admission.
export function developmentArtifact(title:string,text:string){
 const all=title+'\n'+text;
 if(/^(?:EPIC[- #]\d+|Phase\s+\d+\s*:)/i.test(title)&&/##\s*(?:Scope|Tasks|Done when)|- \[ \]/i.test(text))return true;
 if(/##\s*Tasks/i.test(text)&&/- \[ \]/.test(text)&&/##\s*Done when|unit tests|database aggregation|schema|migration/i.test(text))return true;
 if(/(?:server (?:execution )?mission|\[v\d+\].*(?:原型|prototype)|(?:daily|weekly) (?:tech|ecosystem|report)|bản tin|借鉴.*能力增强)/i.test(title))return true;
 if(/\[(?:P\d+[-–]\d+|Server Submission)\]|ready-for-agent|\*\*Agent:|superseding owner direction|owner instructed|\[CTP-\d+|##?\s*(?:What to build|Proposed steps|Earlier specification and evidence)/i.test(all))return true;
 if(/^(?:feat|chore|refactor)(?:\([^)]*\))?\s*:/i.test(title)&&/implementation|models\/|services?\/|schema|migration|data foundations|needs-design/i.test(text))return true;
 return /(?:##?\s*(?:目标|验收|交付|implementation|high-level design|prerequisite)|仅改.{0,30}frontend|只使用内存模拟数据|所有任务.{0,50}均为模拟数据|frontend-v\d)/i.test(all)&&/(?:原型|模拟数据|任务交付|总事项|不接后端|implementation|验收标准|必须实现)/i.test(all);
}
// UI exports are not a user experience, including quoted copies in comments.
export function interfaceArtifact(title:string,text:string){
 const body=text.replace(/^\s*>\s?/gm,'').replace(/\s+/g,' ').trim();
 const labels=['Total Invoiced','Total Paid','Pending','Overdue','Add Invoice','Invoice #','Client','Amount','Due Date','Status','Action'];
 const count=labels.filter(label=>body.toLowerCase().includes(label.toLowerCase())).length;
 const experience=/\b(?:I|we|my|our)\b.{0,100}\b(?:use|used|tried|spend|spent|struggle|lost|cannot|can't|failed|paid)\b|我(?:们)?.{0,40}(?:使用|花了|遇到|无法|失败)/i.test(body);
 return /invoice|发票/i.test(title+' '+body)&&count>=8&&!experience;
}
export function promotionalArtifact(title:string,text:string){
 return /^(?:\[TOOL\]|For sale:|Show HN:)/i.test(title)||/##\s*Tool Information/i.test(text)&&/Tool Name:|Website URL:/i.test(text)||/(?:show hn\s*:|we (?:built|launched)|our product|产品发布|产品宣传)/i.test(title+'\n'+text);
}
// Recognized bilingual scope anchors; absence is not a universal semantic judgment.
export function businessScope(scope:string|ResearchScope){
 const topic=typeof scope==='string'?scope:[scope.title,scope.audience].join(' ');
 return /外包|自由职业|freelanc|agency|agencies|contractor/i.test(topic)&&/回款|发票|应收|催收|invoice|receivable|payment|billing/i.test(topic);
}
export function businessSourceMatch(title:string,text:string){
 const all=title+'\n'+text;
 return /外包|自由职业|freelanc|agency|agencies|contractor|client projects?|客户项目/i.test(all)&&/回款|发票|应收|催收|invoice|receivable|overdue|payment|billing/i.test(all);
}
export type ResearchScope={title?:string;audience?:string;exclusions?:string};
export function sourceFit(e:Pick<Evidence,'kind'|'title'|'text'|'url'>&{source?:string},scope:string|ResearchScope){
 const topic=typeof scope==='string'?scope:[scope.title,scope.audience].filter(Boolean).join(' ');
 const excluded=typeof scope==='string'?'':scope.exclusions||'';
 if(e.kind!=='public')return {allowed:true,reason:''};
 if(interfaceArtifact(e.title,e.text))return {allowed:false,reason:'界面字段或其引用副本，暂不纳入需求分析；未提供具体使用经历。'};
 if(developmentArtifact(e.title,e.text))return {allowed:false,reason:'开发任务、原型交付或资讯汇总，暂不纳入需求分析；不是用户使用经历。'};
 const productWords=(text:string)=>[...text.matchAll(/\b(n8n|dify|cloudflare|discourse)\b/gi)].map(m=>m[1].toLowerCase());
 let address='';try{address=new URL(e.url).pathname.toLowerCase();}catch{}
 if(productWords(excluded).some(product=>address.includes(product)||e.title.toLowerCase().includes(product)))return {allowed:false,reason:'资料属于研究范围明确排除的产品，暂不纳入分析。'};
 const products=productWords(topic);
 if(!products.length&&businessScope(scope)&&!/文档|官方|维基百科|统计|新闻/.test(e.source||'')&&!businessSourceMatch(e.title,e.text))return {allowed:false,reason:'未同时命中目标人群与回款／发票业务动作，暂不纳入需求分析；不代表没有需求。'};
 if(!products.length)return {allowed:true,reason:''};
 let u:URL;try{u=new URL(e.url);}catch{return {allowed:true,reason:''};}
 if(u.hostname==='github.com'){const parts=u.pathname.split('/').filter(Boolean),repo=parts[1]?.toLowerCase()||'';const title=e.title.toLowerCase();if(!products.some(product=>repo.includes(product)||title.includes(product)))return {allowed:false,reason:'来自其他产品仓库，仅正文提及研究产品，相关性需人工核查；暂不纳入需求分析。'};}
 return {allowed:true,reason:''};
}
