import type {Evidence} from './domain';
export const SOURCE_REQUEST_CAP=10;
export function plainSource(s:string){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
export async function publicJSON(url:string,signal?:AbortSignal){
  const response=await fetch(url,{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  if(response.status>=300&&response.status<400)throw new Error('SOURCE_REDIRECT_REJECTED');
  if(!response.ok)throw new Error('SOURCE_'+response.status);
  return response.json() as Promise<any>;
}
export type Collection={query:string;evidence:Evidence[];usableIds:string[];requests:number;failed:number;skipped:number;limited:boolean;since:number|null};
// Search and source items are fixed public destinations. Links inside posts are never fetched.
export async function collectHN(query:string,since:number|null,cap=SOURCE_REQUEST_CAP):Promise<Collection>{
  const out:Collection={query,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,since};
  const signal=AbortSignal.timeout(25000);
  async function json(url:string){if(out.requests>=cap){out.limited=true;throw new Error('SOURCE_BUDGET');}out.requests++;return publicJSON(url,signal);}
  const filter=since===null?'':'&numericFilters='+encodeURIComponent('created_at_i>='+since);
  let search:any;try{search=await json('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&query='+encodeURIComponent(query)+filter);}catch{out.failed++;return out;}
  const ids=[...new Set((Array.isArray(search?.hits)?search.hits:[]).map((h:any)=>String(h.objectID)).filter((id:string)=>/^\d{1,12}$/.test(id)))].slice(0,3) as string[];
  async function evidence(item:any,id:string,root:string,title:string,isComment:boolean){
    if(!item||String(item.id)!==id||item.deleted||item.dead||(isComment?item.type!=='comment'||String(item.parent)!==root:item.type!=='story')){out.skipped++;return;}
    if(typeof item.time!=='number'||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+300||(since!==null&&item.time<since)){out.skipped++;return;}
    const text=plainSource(typeof item.text==='string'?item.text:'');
    const author=typeof item.by==='string'?item.by:'';
    const hash=author?await crypto.subtle.digest('SHA-256',new TextEncoder().encode(author)):null;
    const e:Evidence={id:'HN'+id,title:(isComment?'评论 · ':'')+title.slice(0,180),text:text.slice(0,5000)||'该帖子只有标题和外链，未取得正文；不能据此形成需求结论。',source:'Hacker News',date:new Date(item.time*1000).toISOString().slice(0,10),fetched:new Date().toISOString(),author:hash?Array.from(new Uint8Array(hash)).slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join(''):'',thread:root,url:'https://news.ycombinator.com/item?id='+id,kind:'public',stance:'context',excluded:false,truncated:!text||text.length>5000,contentType:isComment?'comment':'story'};
    out.evidence.push(e);if(text.length>=40)out.usableIds.push(e.id);
  }
  const stories=await Promise.allSettled(ids.map(async id=>({id,item:await json('https://hacker-news.firebaseio.com/v0/item/'+id+'.json')})));
  for(const result of stories){
    if(result.status==='rejected'){out.failed++;continue;}
    const {id,item}=result.value;if(!item||String(item.id)!==id||item.deleted||item.dead||typeof item.time!=='number'||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+300||(since!==null&&item.time<since)){out.skipped++;continue;}
    const title=plainSource(typeof item.title==='string'?item.title:'无标题讨论');
    await evidence(item,id,id,title,false);
    const kids=[...new Set((Array.isArray(item.kids)?item.kids:[]).map(String).filter((x:string)=>/^\d{1,12}$/.test(x)))].slice(0,2) as string[];
    const comments=await Promise.allSettled(kids.map(async child=>({id:child,item:await json('https://hacker-news.firebaseio.com/v0/item/'+child+'.json')})));
    for(const c of comments){if(c.status==='rejected'){out.failed++;continue;}await evidence(c.value.item,c.value.id,id,title,true);}
  }
  return out;
}
