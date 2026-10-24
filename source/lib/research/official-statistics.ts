import type {Evidence} from './domain';
import {articleText,decodeEntities,extractArticleBlock,matchesSourceQuery,sourceFailure,sourceResponse,type ExpandedCollection} from './expanded-sources';
export const STATISTICS_SOURCE='国家统计局';
export const STATISTICS_INDEX='https://www.stats.gov.cn/sj/zxfb/';
export function statisticsArticle(value:string){try{const u=new URL(value,STATISTICS_INDEX);if(u.origin!=='https://www.stats.gov.cn'||u.username||u.password||u.port||!/^\/sj\/zxfb\/20\d{4}\/t20\d{6}_\d{5,12}\.html$/.test(u.pathname))return null;return u.origin+u.pathname;}catch{return null;}}
export function statisticsCandidates(html:string,query:string,since:number|null){
 // Only the latest-release list is searched. No assumption of an official
 // full-database API and no interpretation of titles as statistical evidence.
 const list=extractArticleBlock(html,/<div\b[^>]*\bclass=["'][^"']*\blist-content\b[^"']*["'][^>]*>/i),seen=new Set<string>(),out:{url:string;title:string;date:string}[]=[];
 for(const match of [...list.matchAll(/<li\b[^>]*>([^]*?)<\/li\s*>/gi)].slice(0,50)){
  const row=match[1],link=/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([^]*?)<\/a\s*>/i.exec(row),stamp=/<span\b[^>]*>\s*(20\d{2}-\d{2}-\d{2})\s*<\/span\s*>/i.exec(row)?.[1];if(!link||!stamp)continue;
  const url=statisticsArticle(decodeEntities(link[1])),title=articleText(link[2]),time=Date.parse(stamp+'T00:00:00+08:00');
  if(!url||seen.has(url)||!Number.isFinite(time)||time>Date.now()+300000||since!==null&&time<since*1000||!matchesSourceQuery(title,query))continue;
  seen.add(url);out.push({url,title:title.slice(0,180),date:stamp});
 }return out.slice(0,3);
}
export function statisticsBody(html:string){
 const block=extractArticleBlock(html,/<div\b[^>]*\bclass=["'][^"']*\btrs_editor_view\b[^"']*["'][^>]*>/i);
 const text=articleText(block.replace(/<\/t[dh]\s*>/gi,' | ').replace(/<\/tr\s*>/gi,'\n'));
 if(text.length<80)throw Error('SOURCE_ARTICLE_UNAVAILABLE');return text;
}
export async function collectOfficialStatistics(query:string,since:number|null,cap=2,fetcher:typeof fetch=fetch):Promise<ExpandedCollection>{
 const out:ExpandedCollection={query,since,evidence:[],usableIds:[],requests:0,failed:0,skipped:0,limited:false,sourceDetails:[]};if(cap<1){out.limited=true;return out;}
 let code:string|undefined;
 try{out.requests++;const index=await sourceResponse(STATISTICS_INDEX,512000,fetcher,'text/html');if(!/text\/html/i.test(index.contentType))throw Error('SOURCE_BAD_FEED');const rows=statisticsCandidates(index.text,query,since);
  out.limited=rows.length>1||rows.length>0&&cap<2;
  if(rows.length&&cap>=2){const row=rows[0];out.requests++;const body=await sourceResponse(row.url,1500000,fetcher,'text/html');if(!/text\/html/i.test(body.contentType))throw Error('SOURCE_ARTICLE_UNAVAILABLE');const text=statisticsBody(body.text);
   const evidence:Evidence={id:'NBS'+row.url.split('/').at(-1)!.replace('.html',''),title:row.title,text:text.slice(0,5000),source:STATISTICS_SOURCE,date:row.date,fetched:new Date().toISOString(),author:'',thread:row.url,url:row.url,kind:'public',stance:'context',excluded:false,truncated:text.length>5000,contentType:'article',contentBasis:'full'};out.evidence.push(evidence);out.usableIds.push(evidence.id);
  }
 }catch(error){out.failed++;code=sourceFailure(error);out.sourceErrors=[code];}
 out.sourceDetails.push({source:STATISTICS_SOURCE,state:code?'failed':out.evidence.length?'ok':'empty',requests:out.requests,items:out.evidence.length,full:out.evidence.length,excerpts:0,...(code?{code}:{})});return out;
}
