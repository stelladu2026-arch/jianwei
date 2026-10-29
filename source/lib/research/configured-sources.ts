// Server-only credentials never enter snapshots or status responses.
import {env} from '@/lib/deployment/runtime-env';
import {collectPublic,SOURCE_REQUEST_CAP} from './collection';
import {sourceProfile,focusedSourceQuery,collectWebDiscovery} from './research-channels';
import {collectBocha,collectDiscussions,collectCommunity,COMMUNITY_HOSTS,type CommunityKey} from './additional-channels';
function settings(){return {bocha:env.BOCHA_SEARCH_ENABLED==='true'&&!!env.BOCHA_API_KEY?.trim(),tavily:env.WEB_SEARCH_ENABLED==='true'&&!!env.TAVILY_API_KEY?.trim(),discussions:env.GITHUB_DISCUSSIONS_ENABLED==='true'&&!!env.GITHUB_DISCUSSIONS_TOKEN?.trim(),communities:(env.RESEARCH_COMMUNITIES||'').split(',').map(x=>x.trim()).filter((x):x is CommunityKey=>Object.hasOwn(COMMUNITY_HOSTS,x)).filter((x,i,a)=>a.indexOf(x)===i).slice(0,1)};}
export function publicSourceStatus(){const s=settings();return {webSearchReady:s.tavily||s.bocha,bochaReady:s.bocha,tavilyReady:s.tavily,discussionsReady:s.discussions,communities:s.communities};}
export function sourcePolicy(){return 'topic-sources/7:'+JSON.stringify(publicSourceStatus());}
export function matchingCommunities(query:string,topic:string,keys:CommunityKey[]){const text=query+' '+topic;return keys.filter(key=>key==='n8n'?/\bn8n\b/i.test(text):key==='cloudflare'?/\bcloudflare\b|workers|cloudflare pages/i.test(text):/\bdiscourse\b/i.test(text));}
export function collectConfiguredPublic(query:string,since:number|null,cap=SOURCE_REQUEST_CAP,topic=''){
 const s=settings(),channels=[];
 if(s.bocha)channels.push({name:'博查网页搜索',cap:1,run:(q:string,t:number|null,n:number)=>collectBocha(q,t,n,env.BOCHA_API_KEY!.trim())});
 if(s.discussions)channels.push({name:'GitHub Discussions',cap:1,run:(q:string,t:number|null,n:number)=>collectDiscussions(focusedSourceQuery(q,sourceProfile(q,topic),topic),t,n,env.GITHUB_DISCUSSIONS_TOKEN!.trim())});
 for(const key of matchingCommunities(query,topic,s.communities))channels.push({name:'产品社区 · '+key,cap:2,run:(q:string,t:number|null,n:number)=>collectCommunity(q,t,n,key)});
 return collectPublic(query,since,cap,{topic,channels,...(s.tavily?{webSearch:(q:string,t:number|null,n:number)=>collectWebDiscovery(q,t,n,env.TAVILY_API_KEY!.trim())}:{})});
}
