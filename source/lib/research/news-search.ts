import type {Evidence} from './domain';
import {articleText,decodeEntities,extractArticleBlock,matchesSourceQuery,sourceFailure,sourceResponse,type ExpandedCollection} from './expanded-sources';

export const NEWS_SOURCE='中国新闻网';
const ORIGIN='https://www.chinanews.com.cn';
// Search results contain legacy http links. Upgrade only this exact official
// hostname, then enforce a fixed article path; never request an arbitrary URL.
export function canonicalNewsArticle(value:unknown){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.hostname!=='www.chinanews.com.cn'||u.port||u.username||u.password||!/^\/[a-z]{2,12}\/20\d{2}\/\d{2}-\d{2}\/\d{6,12}\.shtml$/.test(u.pathname))return null;return ORIGIN+u.pathname;}catch{return null;}
}
// Read the site's inert JSON literal. No JavaScript is evaluated. A bracket
// scanner respects JSON strings, including escaped quotes and ] inside text.
export function newsSearchRows(html:string):unknown[]{
 const match=/\bvar\s+docArr\s*=\s*/.exec(html);if(!match)throw Error('SOURCE_BAD_FEED');
 const at=match.index+match[0].length;if(html[at]!=='[')throw Error('SOURCE_BAD_FEED');
 let depth=0,string=false,escaped=false;
 for(let i=at;i<html.length;i++){const c=html[i];if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}if(c==='"'){string=true;continue;}if(c==='[')depth++;if(c===']'&&--depth===0){const rows=JSON.parse(html.slice(at,i+1));if(!Array.isArray(rows))throw Error('SOURCE_BAD_FEED');return rows.slice(0,30);}}
 throw Error('SOURCE_BAD_FEED');
}
function searchText(text:string){return articleText(text.replace(/<\/?em\b[^>]*>/gi,''));}
export function parseNewsSearch(html:string,query:string,since:number|null):Evidence[]{
 const rows=newsSearchRows(html),out:Evidence[]=[],seen=new Set<string>();
 for(const raw of rows){if(!raw||typeof raw!=='object')continue;const row=raw as Record<string,unknown>,url=canonicalNewsArticle(row.url);
  const title=searchText(Array.isArray(row.title)?row.title.filter(t=>typeof t==='string').join(' '):typeof row.title==='string'?row.title:'');
  const text=searchText(typeof row.content_without_tag==='string'?decodeEntities(row.content_without_tag):'');
  const stamp=typeof row.pubtime==='string'&&/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.pubtime)?row.pubtime.replace(' ','T')+'+08:00':'',time=Date.parse(stamp);
  if(!url||seen.has(url)||!Number.isFinite(time)||time>Date.now()+300000||since!==null&&time<since*1000||title.length<2||text.length<40||!matchesSourceQuery(title+' '+text,query))continue;
  seen.add(url);out.push({id:'CNS'+url.split('/').at(-1)!.replace('.shtml',''),title:title.slice(0,180),text:text.slice(0,5000),source:NEWS_SOURCE,date:stamp.slice(0,10),fetched:new Date().toISOString(),author:'',thread:url,url,kind:'public',stance:'context',excluded:false,truncated:true,contentType:'article',contentBasis:'excerpt'});
  if(out.length>=3)break;
 }return out;
}
export async function enrichNewsArticle(evidence:Evidence,fetcher:typeof fetch=fetch):Promise<Evidence>{
 const url=canonicalNewsArticle(evidence.url);if(!url)throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 const body=await sourceResponse(url,1500000,fetcher,'text/html');if(!/text\/html/i.test(body.contentType))throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 const text=articleText(extractArticleBlock(body.text,/<div\b[^>]*\bclass=["'][^"']*\bleft_zw\b[^"']*["'][^>]*>/i));
 if(text.length<80)throw Error('SOURCE_ARTICLE_UNAVAILABLE');
 return {...evidence,text:text.slice(0,5000),truncated:text.length>5000,contentBasis:'full'};
}
export async function collectNewsSearch(query:string,since:number|null,cap=1,fetcher:typeof fetch=fetch):Promise<ExpandedCollection>{
 const out:ExpandedCollection={query,since,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,sourceDetails:[]};
 if(cap<1){out.limited=true;return out;}
 const url=new URL('https://sou.chinanews.com.cn/search.do');url.searchParams.set('q',query.slice(0,100));out.requests=1;
 try{const body=await sourceResponse(url.toString(),512000,fetcher,'text/html');if(!/text\/html/i.test(body.contentType))throw Error('SOURCE_BAD_FEED');out.evidence=parseNewsSearch(body.text,query,since);out.usableIds=out.evidence.map(e=>e.id);out.sourceDetails.push({source:NEWS_SOURCE,state:out.evidence.length?'ok':'empty',requests:1,items:out.evidence.length,full:0,excerpts:out.evidence.length});out.limited=out.evidence.length===3;}
 catch(error){out.failed=1;const code=sourceFailure(error);out.sourceErrors=[code];out.sourceDetails.push({source:NEWS_SOURCE,state:'failed',requests:1,items:0,full:0,excerpts:0,code});}
 return out;
}
