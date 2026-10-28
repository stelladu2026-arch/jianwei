// Server boundary: credentials are captured by the collector closure, never snapshots.
import {env} from '@/lib/deployment/runtime-env';
import {collectPublic,SOURCE_REQUEST_CAP} from './collection';
import {collectWebDiscovery} from './research-channels';
export function publicSourceStatus(){return {webSearchReady:env.WEB_SEARCH_ENABLED==='true'&&typeof env.TAVILY_API_KEY==='string'&&!!env.TAVILY_API_KEY.trim()};}
export function sourcePolicy(){return 'topic-sources/1:web'+Number(publicSourceStatus().webSearchReady);}
export function collectConfiguredPublic(query:string,since:number|null,cap=SOURCE_REQUEST_CAP,topic=''){
 const ready=publicSourceStatus().webSearchReady,key=ready?env.TAVILY_API_KEY!.trim():'';
 return collectPublic(query,since,cap,{topic,...(ready?{webSearch:(q:string,s:number|null,n:number)=>collectWebDiscovery(q,s,n,key)}:{})});
}
