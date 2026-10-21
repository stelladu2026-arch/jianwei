import type {Evidence} from './domain';
import type {Collection} from './collection';
import {plainSource} from './collection';
import {isV2exNode} from './domestic-sources';
const ORIGIN='https://www.v2ex.com',MAX_BYTES=512000;
export const V2EX_SOURCE='V2EX';
// Fixed public subscription endpoint; no token, external link fetch or retry.
async function feedJSON(node:string){
 const url=ORIGIN+'/feed/'+node+'.json';
 const response=await fetch(url,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'JianweiResearch/0.8 (public node subscription)'},signal:AbortSignal.timeout(12000)});
 if(response.status>=300&&response.status<400)throw new Error('SOURCE_REDIRECT_REJECTED');
 if(!response.ok)throw new Error(response.status===429?'SOURCE_429':response.status===403?'SOURCE_403':'SOURCE_FAILURE');
 if(!(response.headers.get('Content-Type')||'').includes('json'))throw new Error('SOURCE_BAD_FEED');
 if(!response.body)throw new Error('SOURCE_BAD_FEED');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES)throw new Error('SOURCE_TOO_LARGE');chunks.push(part.value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 let data:any;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error('SOURCE_BAD_FEED')}
 if(!data||data.version!=='https://jsonfeed.org/version/1'||data.feed_url!==url||data.home_page_url!==ORIGIN+'/go/'+node||!Array.isArray(data.items))throw new Error('SOURCE_BAD_FEED');
 return data.items.slice(0,50) as any[];
}
async function authorId(name:unknown){if(typeof name!=='string'||!name.trim())return '';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('v2ex:'+name.trim()));return 'v2ex:'+Array.from(new Uint8Array(hash)).slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function collectV2exFeed(node:string,since:number|null,cap=1):Promise<Collection>{
 if(!isV2exNode(node))throw new Error('SOURCE_HOST_REJECTED');
 const out:Collection={query:node,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,since};
 if(cap<1){out.limited=true;return out}
 let items:any[];try{out.requests++;items=await feedJSON(node)}catch(e){out.failed++;const code=(e as Error).message;out.sourceErrors=[['SOURCE_REDIRECT_REJECTED','SOURCE_429','SOURCE_403','SOURCE_BAD_FEED','SOURCE_TOO_LARGE'].includes(code)?code:'SOURCE_FAILURE'];return out}
 const seen=new Set<string>();
 for(const item of items){
  if(!item||typeof item.url!=='string'||item.id!==item.url){out.skipped++;continue}
  const match=item.url.match(/^https:\/\/www\.v2ex\.com\/t\/(\d{1,12})$/),time=typeof item.date_published==='string'?Date.parse(item.date_published):NaN;
  if(!match||seen.has(match[1])||!Number.isFinite(time)||time<0||time>Date.now()+300000||(since!==null&&time<since*1000)){out.skipped++;continue}
  seen.add(match[1]);const text=plainSource(typeof item.content_text==='string'?item.content_text:typeof item.content_html==='string'?item.content_html:''),title=plainSource(typeof item.title==='string'?item.title:'无标题讨论');
  if(text.length<40){out.skipped++;continue}
  const evidence:Evidence={id:'V2EX'+match[1],title:title.slice(0,180),text:text.slice(0,5000),source:V2EX_SOURCE,date:new Date(time).toISOString().slice(0,10),fetched:new Date().toISOString(),author:await authorId(item.author?.name),thread:'v2ex:'+match[1],url:item.url,kind:'public',stance:'context',excluded:false,truncated:text.length>5000,contentType:'story'};
  out.evidence.push(evidence);out.usableIds.push(evidence.id);
  if(out.evidence.length>=6){out.limited=items.length>out.evidence.length;break}
 }
 return out;
}
