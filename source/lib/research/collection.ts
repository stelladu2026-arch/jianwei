import type {Evidence} from './domain';
export const SOURCE_REQUEST_CAP=10;
export const WIKI_SOURCE='中文维基百科';
export const WIKI_MAX_REQUESTS=3;
export const WIKI_FETCH_HEADERS={'Accept':'application/json','User-Agent':'JianweiResearch/0.7 (public encyclopedia extract; no account)'};
const HN_WITHIN_CAP=SOURCE_REQUEST_CAP-WIKI_MAX_REQUESTS;
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
export type Collection={query:string;evidence:Evidence[];usableIds:string[];requests:number;failed:number;skipped:number;limited:boolean;since:number|null};
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
  const ids=[...new Set((Array.isArray(search?.hits)?search.hits:[]).map((h:any)=>String(h.objectID)).filter((id:string)=>/^\d{1,12}$/.test(id)))].slice(0,3) as string[];
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
    const e:Evidence={id:'WP'+id,title:plainSource(typeof page.title==='string'?page.title:'无标题条目').slice(0,180),text:text.slice(0,5000)||'该条目只有标题或重定向，未取得百科正文；不能据此形成需求结论。',source:WIKI_SOURCE,date:new Date(time*1000).toISOString().slice(0,10),fetched:new Date().toISOString(),author:await anonAuthor(author),thread:'zhwiki:'+id,url:'https://zh.wikipedia.org/?curid='+id,kind:'public',stance:'context',excluded:false,truncated:!text||text.length>5000,contentType:'article'};
    out.evidence.push(e);if(text.length>=40)out.usableIds.push(e.id);
  }
  return out;
}
export async function collectPublic(query:string,since:number|null,cap=SOURCE_REQUEST_CAP):Promise<Collection>{
  const hn=await collectHN(query,since,Math.max(0,Math.min(HN_WITHIN_CAP,cap-Math.min(WIKI_MAX_REQUESTS,cap))));
  const wiki=await collectZhWiki(query,since,Math.max(0,cap-hn.requests));
  return {query,evidence:[...hn.evidence,...wiki.evidence],usableIds:[...hn.usableIds,...wiki.usableIds],requests:hn.requests+wiki.requests,failed:hn.failed+wiki.failed,skipped:hn.skipped+wiki.skipped,limited:hn.limited||wiki.limited,since};
}
