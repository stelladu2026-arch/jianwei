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
  const articles=publicItems.filter(e=>['少数派','博客园','OSCHINA'].includes(e.source));
  if(articles.length)qualification.push(`中文文章及资讯来自近期公开订阅，关键词筛选不等于全站检索；其中 ${articles.filter(e=>e.contentBasis==='excerpt').length} 条仅取得摘要。文章和资讯仅作使用场景或背景线索，不能据此验证目标客户需求、独立人数及付费。`);
  if(sources.includes('国家统计局'))qualification.push('国家统计局资料仅为最新发布列表中标题匹配的统计报告，不是全库检索；宏观统计和汇总数据不能外推为某个产品的目标用户需求或付款证据。需核对指标、地域、时期与统计口径。');
  if(sources.includes('中国新闻网'))qualification.push('中国新闻网为关键词搜索到的公开报道；搜索摘要与已取得的文章正文分别标记，不保证覆盖全部报道。新闻、企业宣传及转载中的数字需核查原始口径，不能当作目标用户需求原话或已验证付款。');
  if(sources.some(s=>s.includes('人工评论')))qualification.push('Issue 评论与原帖保留同一线程，不作为独立客户；只读取有限人工评论，不代表完整讨论。');
  if(sources.some(s=>s.includes('官方')))qualification.push('官方功能文档与最近版本记录仅用于已有能力核查，不证明客户需求；未出现某问题不等于未修复。');
  if(sources.includes('GitHub Issues'))qualification.push('GitHub Issues 为公开问题正文，不含全部评论，搜索可能不完整；开源项目问题和功能请求不能直接代表商业购买需求。');
  if(importedItems.length)qualification.push(importedItems.every(e=>e.authorization==='user-attested')?'导入时操作者已声明有权使用这些资料。该声明不是人群、地域或采集方式已经核实，导入条数也不是独立客户数。':'导入资料需要单独核对其授权、人群和采集方式；导入条数不是独立客户数。');
  return {publicCount:publicItems.length,importedCount:importedItems.length,itemCount:items.length,threadCount:byThread.size,authorCount:byAuthor.size,independentSamples:new Set(items.map((_,i)=>find(i))).size,sources,hnOnlyPublic,truncated:items.filter(e=>e.truncated).length,qualification};
}
