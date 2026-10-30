import {sourceFit} from './source-fit';
import type {Evidence} from './domain';
import type {Collection} from './collection';
import {FEED_SOURCES,type FeedSource} from './source-catalog';

export type SourceReceipt={query?:string;effectiveQuery?:string;batch?:number;source:string;state:'ok'|'empty'|'failed'|'skipped';requests:number;items:number;full:number;excerpts:number;code?:string};
export type ExpandedCollection=Collection & {sourceDetails:SourceReceipt[]};
const FEED_BYTES=512000,ARTICLE_BYTES=1500000;
const ERROR_CODES=new Set(['SOURCE_REDIRECT_REJECTED','SOURCE_429','SOURCE_403','SOURCE_BAD_FEED','SOURCE_TOO_LARGE','SOURCE_TIMEOUT','SOURCE_ARTICLE_UNAVAILABLE']);
export function sourceFailure(error:unknown){const code=error instanceof Error?(['AbortError','TimeoutError'].includes(error.name)?'SOURCE_TIMEOUT':error.message):'';return ERROR_CODES.has(code)?code:'SOURCE_FAILURE';}
function empty(query:string,since:number|null):ExpandedCollection{return {query,since,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,sourceDetails:[]};}
export function decodeEntities(text:string){return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{const names:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};if(entity[0]!=='#')return names[entity.toLowerCase()]||_;const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):' ';});}
export function articleText(html:string){return decodeEntities(html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|noscript|svg|form)\b[^>]*>[^]*?<\/\1\s*>/gi,' ').replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|h[1-6]|section)>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/[\t\r ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function terms(query:string){return [...new Set(query.normalize('NFKC').toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z][a-z0-9+#.-]{1,}/gu)||[])].slice(0,10);}
// Query terms are conjunctive. A generic word such as “整理” cannot admit an
// otherwise unrelated article when the query also asks for “客户反馈”. This is
// a lexical relevance boundary, not a claim of semantic support or user demand.
export function matchesSourceQuery(text:string,query:string){const haystack=text.normalize('NFKC').toLowerCase(),required=terms(query);return required.length>0&&required.every(term=>haystack.includes(term));}
function validTime(value:string,since:number|null){const time=Date.parse(value);return Number.isFinite(time)&&time>=0&&time<=Date.now()+300000&&(since===null||time>=since*1000)?time:null;}
function canonicalArticle(key:FeedSource,value:string){try{const u=new URL(value),source=FEED_SOURCES[key];if(u.origin!==source.origin||u.protocol!=='https:'||u.username||u.password||u.port||!source.path.test(u.pathname))return null;return u.origin+u.pathname;}catch{return null;}}
export async function sourceResponse(url:string,maxBytes:number,fetcher:typeof fetch=fetch,accept='application/xml, application/rss+xml, application/atom+xml'){
 const response=await fetcher(url,{redirect:'manual',headers:{Accept:accept,'User-Agent':'JianweiResearch/0.9 (bounded public research; no account)'},signal:AbortSignal.timeout(10000)});
 if(response.status>=300&&response.status<400)throw Error('SOURCE_REDIRECT_REJECTED');
 if(!response.ok)throw Error(response.status===429?'SOURCE_429':response.status===403?'SOURCE_403':'SOURCE_FAILURE');
 if(Number(response.headers.get('Content-Length'))>maxBytes)throw Error('SOURCE_TOO_LARGE');
 if(!response.body)throw Error('SOURCE_BAD_FEED');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes)throw Error('SOURCE_TOO_LARGE');chunks.push(part.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}return {text:new TextDecoder().decode(bytes),contentType:response.headers.get('Content-Type')||''};
}
function xmlValue(row:string,tag:string){const match=row.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([^]*?)<\\/'+tag+'\\s*>','i'));if(!match)return '';return match[1].replace(/<!\[CDATA\[([^]*?)\]\]>/g,'$1');}
export function parsePublicFeed(key:FeedSource,xml:string,query:string,since:number|null):Evidence[]{
 if(xml.length>FEED_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('SOURCE_BAD_FEED');
 const clean=xml.replace(/<!--[^]*?-->/g,'');const atom=key==='cnblogs';
 if(atom?!/<feed\b[^>]*xmlns=['"]http:\/\/www\.w3\.org\/2005\/Atom['"]/i.test(clean)||!/<\/feed\s*>\s*$/i.test(clean):!/<rss\b/i.test(clean)||!/<\/rss\s*>\s*$/i.test(clean))throw Error('SOURCE_BAD_FEED');
 const rows=[...clean.matchAll(atom?/<entry(?:\s[^>]*)?>([^]*?)<\/entry\s*>/gi:/<item(?:\s[^>]*)?>([^]*?)<\/item\s*>/gi)].slice(0,50),out:Evidence[]=[],seen=new Set<string>();
 for(const match of rows){const row=match[1],title=articleText(xmlValue(row,'title'));let link=decodeEntities(xmlValue(row,'link').trim());
  if(atom){const links=[...row.matchAll(/<link\s+([^>]+)\/?\s*>/gi)];for(const linkTag of links){const attrs=Object.fromEntries([...linkTag[1].matchAll(/([a-z]+)\s*=\s*["']([^"']*)["']/gi)].map(a=>[a[1].toLowerCase(),a[2]]));if((!attrs.rel||attrs.rel==='alternate')&&attrs.href){link=decodeEntities(attrs.href);break;}}}
  const url=canonicalArticle(key,link),time=validTime(xmlValue(row,atom?'published':'pubDate'),since);
  const raw=xmlValue(row,atom?'content':'content:encoded')||xmlValue(row,atom?'summary':'description');const text=articleText(decodeEntities(raw));
  if(!url||time===null||seen.has(url)||title.length<2||text.length<40||!matchesSourceQuery(title+' '+text,query))continue;
  seen.add(url);const id='RSS_'+key+'_'+url.split('/').filter(Boolean).at(-1)!.replace(/\.html$/,'');
  out.push({id,title:title.slice(0,180),text:text.slice(0,5000),source:FEED_SOURCES[key].name,date:new Date(time).toISOString().slice(0,10),fetched:new Date().toISOString(),author:'',thread:url,url,kind:'public',stance:'context',excluded:false,truncated:true,contentType:'article',contentBasis:'excerpt'});
  if(out.length>=3)break;
 }return out;
}
export async function collectPublicFeed(key:FeedSource,query:string,since:number|null,cap=1,fetcher:typeof fetch=fetch):Promise<ExpandedCollection>{
 const out=empty(query,since);if(cap<1){out.limited=true;return out;}out.requests=1;
 try{const body=await sourceResponse(FEED_SOURCES[key].url,FEED_BYTES,fetcher);if(!/xml/i.test(body.contentType))throw Error('SOURCE_BAD_FEED');out.evidence=parsePublicFeed(key,body.text,query,since);out.usableIds=out.evidence.map(e=>e.id);out.sourceDetails.push({source:FEED_SOURCES[key].name,state:out.evidence.length?'ok':'empty',requests:1,items:out.evidence.length,full:0,excerpts:out.evidence.length});}
 catch(error){out.failed=1;const code=sourceFailure(error);out.sourceErrors=[code];out.sourceDetails.push({source:FEED_SOURCES[key].name,state:'failed',requests:1,items:0,full:0,excerpts:0,code});}return out;
}
function articleBlock(key:FeedSource,html:string){
 const opening=key==='cnblogs'?/<div\b[^>]*\bid=["']cnblogs_post_body["'][^>]*>/i:key==='sspai'?/<div\b[^>]*\bclass=["'][^"']*\barticle-body\b[^"']*["'][^>]*>/i:null;
 return extractArticleBlock(html,opening);
}
export function extractArticleBlock(html:string,opening:RegExp|null){
 const start=opening?.exec(html);if(!start)throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 const body=html.slice(start.index+start[0].length),tags=/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>|<\/?div\b[^>]*>/gi;let depth=1;
 for(const tag of body.matchAll(tags)){if(/^<div\b/i.test(tag[0]))depth++;else if(/^<\/div\b/i.test(tag[0]))depth--;if(depth===0)return body.slice(0,tag.index);}throw Error('SOURCE_ARTICLE_UNAVAILABLE');
}
export async function enrichFeedArticle(key:FeedSource,evidence:Evidence,fetcher:typeof fetch=fetch){
 const url=canonicalArticle(key,evidence.url);if(!url||key==='oschina')throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 const body=await sourceResponse(url,ARTICLE_BYTES,fetcher,'text/html');if(!/text\/html/i.test(body.contentType))throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 const text=articleText(articleBlock(key,body.text));if(text.length<80||/解锁全文|付费阅读|购买后.{0,8}阅读|订阅后.{0,8}阅读|会员专享/.test(text))throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 return {...evidence,text:text.slice(0,5000),truncated:text.length>5000,contentBasis:'full' as const};
}
export async function collectGithubIssues(query:string,since:number|null,cap=1,fetcher:typeof fetch=fetch):Promise<ExpandedCollection>{
 const out=empty(query,since),source='GitHub Issues';if(cap<1){out.limited=true;return out;}
 const keywords=terms(query).map(term=>'"'+term.replace(/["\\]/g,'')+'"').join(' ');if(!keywords){out.skipped++;return out;}
 const named=[...query.matchAll(/\b(n8n|dify)\b/gi)].map(m=>m[1].toLowerCase()),products=[...new Set(named)],primary=products.length===1?(products[0]==='n8n'?'n8n-io/n8n':'langgenius/dify'):'';
 const url=new URL('https://api.github.com/search/issues');url.searchParams.set('q',keywords+(primary?' repo:'+primary:'')+' is:issue is:public in:title,body'+(since===null?'':' created:>='+new Date(since*1000).toISOString().slice(0,10)));url.searchParams.set('per_page','5');out.requests=1;
 try{const body=await sourceResponse(url.toString(),FEED_BYTES,fetcher,'application/vnd.github+json');if(!/json/i.test(body.contentType))throw Error('SOURCE_BAD_FEED');const data=JSON.parse(body.text);if(!Array.isArray(data.items)||typeof data.incomplete_results!=='boolean')throw Error('SOURCE_BAD_FEED');out.limited=data.incomplete_results||data.total_count>5;
  const seen=new Set<string>();for(const item of data.items.slice(0,5)){const address=typeof item.html_url==='string'?item.html_url:'',match=address.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d{1,12})$/),time=validTime(typeof item.created_at==='string'?item.created_at:'',since),text=articleText(typeof item.body==='string'?item.body:'');
   if(!match||item.pull_request||item.user?.type==='Bot'||(!Number.isSafeInteger(item.id)||item.id<=0)||seen.has(address)||time===null||text.length<40||typeof item.title!=='string'||!matchesSourceQuery(item.title+' '+text,query)){out.skipped++;continue;}seen.add(address);
   let author='';if(typeof item.user?.login==='string'){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('github:'+item.user.login));author='github:'+Array.from(new Uint8Array(hash)).slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join('');}
   const e:Evidence={id:'GHI'+item.id,title:articleText(item.title).slice(0,180),text:text.slice(0,5000),source,date:new Date(time).toISOString().slice(0,10),fetched:new Date().toISOString(),author,thread:address,url:address,kind:'public',stance:'context',excluded:false,truncated:text.length>5000,contentType:'story',contentBasis:'full'};if(!sourceFit(e,query).allowed||primary&&match[1]+'/'+match[2]!==primary){out.skipped++;continue;}if(primary)e.applicationNote='本次优先检索官方项目仓库；Issue 是作者自述，不是官方确认或已核实事实。';out.evidence.push(e);out.usableIds.push(e.id);
  }out.sourceDetails.push({source,state:out.evidence.length?'ok':'empty',requests:1,items:out.evidence.length,full:out.evidence.length,excerpts:0});
 }catch(error){out.failed=1;const code=sourceFailure(error);out.sourceErrors=[code];out.sourceDetails.push({source,state:'failed',requests:1,items:0,full:0,excerpts:0,code});}return out;
}
