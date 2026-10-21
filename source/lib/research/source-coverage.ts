import type {Evidence} from './domain';
export function sourceCoverage(evidence:Evidence[]){
  const items=evidence.filter(e=>!e.excluded),parent=items.map((_,i)=>i);
  const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const union=(a:number,b:number)=>{const pa=find(a),pb=find(b);if(pa!==pb)parent[pa]=pb;};
  const byThread=new Map<string,number>(),byAuthor=new Map<string,number>();
  items.forEach((e,i)=>{
    const thread=e.thread.trim(),author=e.author.trim();
    if(thread){const prev=byThread.get(thread);if(prev===undefined)byThread.set(thread,i);else union(prev,i);}
    if(author){const prev=byAuthor.get(author);if(prev===undefined)byAuthor.set(author,i);else union(prev,i);}
  });
  const publicItems=items.filter(e=>e.kind==='public'),importedItems=items.filter(e=>e.kind==='imported');
  const sources=[...new Set(publicItems.map(e=>e.source).filter(Boolean))];
  const hnOnlyPublic=publicItems.length>0&&sources.every(s=>s==='Hacker News');
  const qualification:string[]=[];
  const nonUser=sources.length>0&&sources.every(s=>s==='Hacker News'||s==='中文维基百科');
  if(hnOnlyPublic)qualification.push('公开来源目前只有 Hacker News 英语技术社区。这些帖子不能代表目标地域或国内用户，帖子数也不是独立客户数。');
  else if(publicItems.length&&nonUser)qualification.push(`公开来源限于：${sources.join('、')}。${sources.map(s=>s==='Hacker News'?'Hacker News 是英语技术社区':'中文维基百科是公开百科条目，不是国内用户的需求原话').join('；')}。这些正文不能代表目标地域或国内用户，条数也不是独立客户数。`);
  else if(sources.length)qualification.push(`公开来源限于：${sources.join('、')}。未覆盖的人群和地域不能从这些正文外推。`);
  if(sources.includes('V2EX'))qualification.push('V2EX 来自中文技术社区的公开主题订阅，不包含全站检索或完整评论。节点样本不能外推为全体国内用户，兴趣、抱怨和自述不能验证实际付款。');
  if(importedItems.length)qualification.push(importedItems.every(e=>e.authorization==='user-attested')?'导入时操作者已声明有权使用这些资料。该声明不是人群、地域或采集方式已经核实，导入条数也不是独立客户数。':'导入资料需要单独核对其授权、人群和采集方式；导入条数不是独立客户数。');
  return {publicCount:publicItems.length,importedCount:importedItems.length,itemCount:items.length,threadCount:byThread.size,authorCount:byAuthor.size,independentSamples:new Set(items.map((_,i)=>find(i))).size,sources,hnOnlyPublic,truncated:items.filter(e=>e.truncated).length,qualification};
}
