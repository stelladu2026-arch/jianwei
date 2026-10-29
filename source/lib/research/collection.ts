import {canReadDiscovered,readDiscoveredOriginal} from './additional-channels';
import {isAnalysisBody} from './evidence-eligibility';
import {sourceProfile,focusedSourceQuery,collectIssueComments,collectDifyOfficial} from './research-channels';
import type {Evidence} from './domain';
import {collectNewsSearch,enrichNewsArticle,NEWS_SOURCE} from './news-search';
import {collectOfficialStatistics,STATISTICS_SOURCE} from './official-statistics';
import {collectPublicFeed,collectGithubIssues,enrichFeedArticle,matchesSourceQuery,type SourceReceipt} from './expanded-sources';
import {FEED_SOURCES,type FeedSource} from './source-catalog';
export const SOURCE_REQUEST_CAP=10;
export const WIKI_SOURCE='中文维基百科';
export const WIKI_MAX_REQUESTS=3;
export const WIKI_FETCH_HEADERS={'Accept':'application/json','User-Agent':'JianweiResearch/0.7 (public encyclopedia extract; no account)'};

export function plainSource(s:string){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
function allowedSource(url:string){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)return false;
  if(parsed.origin==='https://hn.algolia.com'&&parsed.pathname==='/api/v1/search')return true;
  if(parsed.origin==='https://hacker-news.firebaseio.com'&&/^\/v0\/item\/\d{1,12}\.json$/.test(parsed.pathname))return true;
  if(parsed.origin==='https://zh.wikipedia.org'&&parsed.pathname==='/w/api.php')return true;
  return false;
}
export async function publicJSON(url:string,signal?:AbortSignal){
  if(!allowedSource(url))throw new Error('SOURCE_HOST_REJECTED');
  const headers=url.startsWith('https://zh.wikipedia.org/')?WIKI_FETCH_HEADERS:undefined;
  const response=await fetch(url,{redirect:'manual',headers,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  if(response.status>=300&&response.status<400)throw new Error('SOURCE_REDIRECT_REJECTED');
  if(!response.ok)throw new Error('SOURCE_'+response.status);
  return response.json() as Promise<any>;
}
export type Collection={routing?:{profile:string;effectiveQuery:string};query:string;evidence:Evidence[];usableIds:string[];requests:number;failed:number;skipped:number;limited:boolean;since:number|null;sourceErrors?:string[];sourceDetails?:SourceReceipt[]};
function blank(query:string,since:number|null):Collection{return {query,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,since};}
async function anonAuthor(name:string){if(!name)return '';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));return Array.from(new Uint8Array(hash)).slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join('');}
// Search and source items are fixed public destinations. Links inside posts or articles are never fetched.
export async function collectHN(query:string,since:number|null,cap=SOURCE_REQUEST_CAP):Promise<Collection>{
  const out=blank(query,since);
  if(cap<=0){out.limited=true;return out;}
  const signal=AbortSignal.timeout(25000);
  function take<T>(items:T[]){const room=cap-out.requests;if(room<=0){out.limited=true;return [];}if(items.length>room)out.limited=true;return items.slice(0,room);}
  async function json(url:string){out.requests++;return publicJSON(url,signal);}
  const filter=since===null?'':'&numericFilters='+encodeURIComponent('created_at_i>='+since);
  let search:any;try{search=await json('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&query='+encodeURIComponent(query)+filter);}catch{out.failed++;return out;}
  const ids=[...new Set((Array.isArray(search?.hits)?search.hits:[]).map((h:any)=>String(h.objectID)).filter((id:string)=>/^\d{1,12}$/.test(id)))].slice(0,cap<=4?1:3) as string[];
  async function evidence(item:any,id:string,root:string,title:string,isComment:boolean){
    if(!item||String(item.id)!==id||item.deleted||item.dead||(isComment?item.type!=='comment'||String(item.parent)!==root:item.type!=='story')){out.skipped++;return;}
    if(typeof item.time!=='number'||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+300||(since!==null&&item.time<since)){out.skipped++;return;}
    const text=plainSource(typeof item.text==='string'?item.text:'');
    const author=typeof item.by==='string'?item.by:'';
    const e:Evidence={id:'HN'+id,title:(isComment?'评论 · ':'')+title.slice(0,180),text:text.slice(0,5000)||'该帖子只有标题和外链，未取得正文；不能据此形成需求结论。',source:'Hacker News',date:new Date(item.time*1000).toISOString().slice(0,10),fetched:new Date().toISOString(),author:await anonAuthor(author),thread:root,url:'https://news.ycombinator.com/item?id='+id,kind:'public',stance:'context',excluded:false,truncated:!text||text.length>5000,contentType:isComment?'comment':'story'};
    out.evidence.push(e);if(text.length>=40)out.usableIds.push(e.id);
  }
  const stories=await Promise.allSettled(take(ids).map(async id=>({id,item:await json('https://hacker-news.firebaseio.com/v0/item/'+id+'.json')})));
  for(const result of stories){
    if(result.status==='rejected'){out.failed++;continue;}
    const {id,item}=result.value;if(!item||String(item.id)!==id||item.deleted||item.dead||typeof item.time!=='number'||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+300||(since!==null&&item.time<since)){out.skipped++;continue;}
    const title=plainSource(typeof item.title==='string'?item.title:'无标题讨论');
    if(!matchesSourceQuery(title+' '+plainSource(typeof item.text==='string'?item.text:''),query)){out.skipped++;continue;}
    await evidence(item,id,id,title,false);
    const kids=[...new Set((Array.isArray(item.kids)?item.kids:[]).map(String).filter((x:string)=>/^\d{1,12}$/.test(x)))].slice(0,2) as string[];
    const comments=await Promise.allSettled(take(kids).map(async child=>({id:child,item:await json('https://hacker-news.firebaseio.com/v0/item/'+child+'.json')})));
    for(const c of comments){if(c.status==='rejected'){out.failed++;continue;}await evidence(c.value.item,c.value.id,id,title,true);}
  }
  return out;
}
// One fixed item URL. The id is the only model input; hosts and redirects stay in publicJSON.
export async function readHNItem(id:string,since:number|null):Promise<Collection>{
  const out=blank(id,since);
  if(!/^\d{1,12}$/.test(id)){out.skipped++;return out;}
  const signal=AbortSignal.timeout(25000);
  let item:any;
  try{out.requests++;item=await publicJSON('https://hacker-news.firebaseio.com/v0/item/'+id+'.json',signal);}catch{out.failed++;return out;}
  if(!item||String(item.id)!==id||item.deleted||item.dead||(item.type!=='story'&&item.type!=='comment')){out.skipped++;return out;}
  if(item.type==='comment'&&!/^\d{1,12}$/.test(String(item.parent))){out.skipped++;return out;}
  if(typeof item.time!=='number'||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+300||(since!==null&&item.time<since)){out.skipped++;return out;}
  const title=plainSource(typeof item.title==='string'?item.title:'无标题讨论'),text=plainSource(typeof item.text==='string'?item.text:''),author=typeof item.by==='string'?item.by:'',root=item.type==='comment'?String(item.parent):id;
  const e:Evidence={id:'HN'+id,title:(item.type==='comment'?'评论 · ':'')+title.slice(0,180),text:text.slice(0,5000)||'该帖子只有标题和外链，未取得正文；不能据此形成需求结论。',source:'Hacker News',date:new Date(item.time*1000).toISOString().slice(0,10),fetched:new Date().toISOString(),author:await anonAuthor(author),thread:root,url:'https://news.ycombinator.com/item?id='+id,kind:'public',stance:'context',excluded:false,truncated:!text||text.length>5000,contentType:item.type==='comment'?'comment':'story'};
  out.evidence.push(e);if(text.length>=40)out.usableIds.push(e.id);
  return out;
}
function wikiUrl(params:Record<string,string>){const url=new URL('https://zh.wikipedia.org/w/api.php');for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);return url.toString();}
export async function collectZhWiki(query:string,since:number|null,cap=WIKI_MAX_REQUESTS):Promise<Collection>{
  const out=blank(query,since),limit=Math.min(cap,WIKI_MAX_REQUESTS);
  if(limit<=0){out.limited=true;return out;}
  const signal=AbortSignal.timeout(25000);
  function take<T>(items:T[]){const room=limit-out.requests;if(room<=0){out.limited=true;return [];}if(items.length>room)out.limited=true;return items.slice(0,room);}
  async function json(url:string){out.requests++;return publicJSON(url,signal);}
  let search:any;try{search=await json(wikiUrl({action:'query',format:'json',formatversion:'2',utf8:'1',list:'search',srnamespace:'0',srlimit:'2',srsearch:query.slice(0,160)}));}catch{out.failed++;return out;}
  const ids=[...new Set((Array.isArray(search?.query?.search)?search.query.search:[]).map((hit:any)=>String(hit.pageid)).filter((id:string)=>/^\d{1,12}$/.test(id)))].slice(0,2) as string[];
  const pages=await Promise.allSettled(take(ids).map(async id=>({id,item:await json(wikiUrl({action:'query',format:'json',formatversion:'2',utf8:'1',redirects:'0',prop:'extracts|revisions',explaintext:'1',exchars:'5001',exlimit:'1',rvprop:'user|timestamp',rvlimit:'1',pageids:id}))})));
  for(const result of pages){
    if(result.status==='rejected'){out.failed++;continue;}
    const {id,item}=result.value,rows=Array.isArray(item?.query?.pages)?item.query.pages:[];
    if(rows.length!==1||String(rows[0]?.pageid)!==id||rows[0].missing){out.skipped++;continue;}
    const page=rows[0],revision=Array.isArray(page.revisions)?page.revisions[0]:undefined,stamp=typeof revision?.timestamp==='string'?Date.parse(revision.timestamp):NaN,time=Number.isFinite(stamp)?Math.floor(stamp/1000):NaN;
    if(!Number.isFinite(time)||time<0||time>Date.now()/1000+300||(since!==null&&time<since)){out.skipped++;continue;}
    const raw=plainSource(typeof page.extract==='string'?page.extract:''),text=/^#(redirect|重定向)\b/i.test(raw)?'':raw,author=typeof revision?.user==='string'?revision.user:'';
    const title=plainSource(typeof page.title==='string'?page.title:'无标题条目').slice(0,180);
    if(!matchesSourceQuery(title+' '+text,query)){out.skipped++;continue;}
    const e:Evidence={id:'WP'+id,title,text:text.slice(0,5000)||'该条目只有标题或重定向，未取得百科正文；不能据此形成需求结论。',source:WIKI_SOURCE,date:new Date(time*1000).toISOString().slice(0,10),fetched:new Date().toISOString(),author:await anonAuthor(author),thread:'zhwiki:'+id,url:'https://zh.wikipedia.org/?curid='+id,kind:'public',stance:'context',excluded:false,truncated:!text||text.length>5000,contentType:'article'};
    out.evidence.push(e);if(text.length>=40)out.usableIds.push(e.id);
  }
  return out;
}
export async function collectPublic(query:string,since:number|null,cap=SOURCE_REQUEST_CAP,options:{topic?:string;webSearch?:(query:string,since:number|null,cap:number)=>Promise<Collection>;channels?:{name:string;run:(query:string,since:number|null,cap:number)=>Promise<Collection>;cap:number}[]}={}):Promise<Collection>{
  const limit=Math.max(0,Math.min(SOURCE_REQUEST_CAP,Math.floor(cap))),out=blank(query,since);out.sourceDetails=[];
  if(!limit){out.limited=true;return out;}
  // Reserve fixed allocations first. Results settle independently, with no retries.
  const allocations:{run:()=>Promise<Collection>;cap:number;name:string}[]=[];let remaining=limit-((options.webSearch||options.channels?.some(c=>c.name==='博查网页搜索'))&&limit>=3?1:0);
  const add=(amount:number,name:string,run:(cap:number)=>Promise<Collection>)=>{const room=Math.min(amount,remaining);if(room<1)return;remaining-=room;allocations.push({cap:room,name,run:()=>run(room)});};
  const chinese=/[\p{Script=Han}]/u.test(query);
  const profile=sourceProfile(query,options.topic),focused=focusedSourceQuery(query,profile);out.routing={profile,effectiveQuery:focused};
  for(const channel of options.channels||[])add(channel.cap,channel.name,n=>channel.run(query,since,n));
  if(profile!=='general'){
   add(3,'GitHub Issues 与人工评论',async n=>{const root=await collectGithubIssues(focused,since,1),comments=n>1?await collectIssueComments(root.evidence,focused,since,n-1):null;if(comments){root.evidence.push(...comments.evidence);root.usableIds.push(...comments.usableIds);root.requests+=comments.requests;root.failed+=comments.failed;root.sourceDetails.push(...(comments.sourceDetails||[]));}return root;});
   if(profile==='dify')add(2,'GitHub 文档 · Dify 官方项目',n=>collectDifyOfficial(focused,since,n));
   if(options.webSearch)add(1,'网页搜索发现',n=>options.webSearch!(query,since,n));
   add(3,'Hacker News',n=>collectHN(focused,since,n));
   if(chinese)add(1,NEWS_SOURCE,n=>collectNewsSearch(query,since,n));
   for(const key of Object.keys(FEED_SOURCES) as FeedSource[])add(1,FEED_SOURCES[key].name,n=>collectPublicFeed(key,query,since,n));
   add(1,WIKI_SOURCE,n=>collectZhWiki(query,since,n));
  }else{
  if(options.webSearch)add(1,'网页搜索发现',n=>options.webSearch!(query,since,n));
  add(1,NEWS_SOURCE,n=>collectNewsSearch(query,since,n));
  if(chinese)add(2,STATISTICS_SOURCE,n=>collectOfficialStatistics(query,since,n));
  add(1,'GitHub Issues',n=>collectGithubIssues(query,since,n));
  for(const key of Object.keys(FEED_SOURCES) as FeedSource[])add(1,FEED_SOURCES[key].name,n=>collectPublicFeed(key,query,since,n));
  if(!chinese)add(3,'Hacker News',n=>collectHN(query,since,n));
  add(2,WIKI_SOURCE,n=>collectZhWiki(query,since,n));
  }
  const results=await Promise.allSettled(allocations.map(job=>job.run()));
  for(let i=0;i<results.length;i++){
    const result=results[i];if(result.status==='rejected'){out.requests+=allocations[i].cap;out.failed++;out.sourceDetails.push({source:allocations[i].name,state:'failed',requests:allocations[i].cap,items:0,full:0,excerpts:0,code:'SOURCE_FAILURE'});continue;}
    const value=result.value;out.evidence.push(...value.evidence);out.usableIds.push(...value.usableIds);out.requests+=value.requests;out.failed+=value.failed;out.skipped+=value.skipped;out.limited||=value.limited;
    out.sourceErrors=[...(out.sourceErrors||[]),...(value.sourceErrors||[])];out.sourceDetails.push(...(value.sourceDetails||[{source:allocations[i].name,state:value.failed&&!value.usableIds.length?'failed':value.usableIds.length?'ok':'empty',requests:value.requests,items:value.usableIds.length,full:value.evidence.filter(e=>value.usableIds.includes(e.id)&&!e.truncated).length,excerpts:value.evidence.filter(e=>value.usableIds.includes(e.id)&&e.truncated).length}]));
  }
  // A bounded original read is reserved for discovery; unsupported hosts remain summaries.
  for(let i=0;i<out.evidence.length&&out.requests<limit;i++){const e=out.evidence[i];if(e.contentBasis!=='excerpt'||!/博查|网页搜索发现/.test(e.source)||!canReadDiscovered(e.url))continue;const receipt=out.sourceDetails.find(r=>e.source.startsWith(r.source));if(!receipt)continue;out.requests++;receipt.requests++;
    try{const original=await readDiscoveredOriginal(e);const date=Date.parse(original.date);if(since!==null&&Number.isFinite(date)&&date<since*1000)throw Error('SOURCE_OUTSIDE_PERIOD');out.evidence[i]=original;if(!original.truncated){receipt.full++;receipt.excerpts--;}out.usableIds.push(e.id);}catch{out.failed++;receipt.code='SOURCE_ORIGINAL_UNAVAILABLE';(out.sourceErrors||=[]).push('SOURCE_ORIGINAL_UNAVAILABLE');}break;
  }
  // Spare requests enrich matching originals. Each publisher gets at most one;
  // every failure still counts, and no new search or hidden retry is started.
  for(const key of ['chinanews','sspai','cnblogs'] as const){if(out.requests>=limit)break;const index=out.evidence.findIndex(e=>e.source===(key==='chinanews'?NEWS_SOURCE:FEED_SOURCES[key].name)&&e.contentBasis==='excerpt');if(index<0)continue;
    const receipt=out.sourceDetails.find(row=>row.source===(key==='chinanews'?NEWS_SOURCE:FEED_SOURCES[key].name))!;out.requests++;receipt.requests++;
    try{out.evidence[index]=await (key==='chinanews'?enrichNewsArticle(out.evidence[index]):enrichFeedArticle(key,out.evidence[index]));receipt.full++;receipt.excerpts--;}
    catch{out.failed++;receipt.code='SOURCE_ARTICLE_UNAVAILABLE';(out.sourceErrors||=[]).push('SOURCE_ARTICLE_UNAVAILABLE');}
  }
  if(profile!=='general')out.sourceDetails.push({source:'主题渠道分配：'+profile,state:'skipped',requests:0,items:0,full:0,excerpts:0,code:'SOURCE_TOPIC_ROUTING'});
  if(!options.webSearch)out.sourceDetails.push({source:'网页搜索发现',state:'skipped',requests:0,items:0,full:0,excerpts:0,code:'SEARCH_NOT_CONFIGURED'});
  const omitted=profile!=='general'?STATISTICS_SOURCE:chinese?'Hacker News':STATISTICS_SOURCE;
  out.sourceDetails.push({source:omitted,state:'skipped',requests:0,items:0,full:0,excerpts:0,code:profile!=='general'?'SOURCE_TOPIC_PRIORITY':'SOURCE_LANGUAGE_PRIORITY'});
  out.usableIds=out.usableIds.filter(id=>out.evidence.some(e=>e.id===id&&isAnalysisBody(e)));
  out.limited||=allocations.length<7;return out;
}
