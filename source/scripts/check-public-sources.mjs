// Opt-in, anonymous public-source acceptance only. No app, database or model
// credentials are read and no project is created. Default invocation is offline.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
if(!process.argv.includes('--live')){console.log('PUBLIC_SOURCE_CHECK_SKIPPED: use --live for bounded anonymous public HTTP checks.');process.exit(0);}
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true};}return next(specifier,context)}});
const {collectPublic}=await import('../lib/research/collection.ts');
const started=new Date().toISOString(),results=[];
for(const query of ['宠物','消费','AI']){
 const result=await collectPublic(query,null);
 if(result.requests>10)throw Error('PUBLIC_SOURCE_CHECK_BUDGET_EXCEEDED');
 const receipt={query,requests:result.requests,failed:result.failed,usable:result.usableIds.length,sources:result.sourceDetails,samples:result.evidence.filter(e=>['中国新闻网','国家统计局'].includes(e.source)).map(e=>({source:e.source,url:e.url,basis:e.contentBasis,characters:e.text.length}))};
 results.push(receipt);console.log('PUBLIC_SOURCE_CHECK '+JSON.stringify(receipt));
}
const verified=results.some(result=>result.query==='宠物'&&result.sources.some(row=>row.source==='中国新闻网'&&row.state==='ok'&&row.full>0))&&results.some(result=>result.sources.some(row=>row.source==='国家统计局'&&row.state==='ok'&&row.full>0));
console.log('PUBLIC_SOURCE_ACCEPTANCE '+JSON.stringify({started,finished:new Date().toISOString(),verified,requests:results.reduce((n,r)=>n+r.requests,0),actualModelCalls:0,projectWrites:0}));
if(!verified&&!process.argv.includes('--report-only'))throw Error('PUBLIC_SOURCE_ACCEPTANCE_INCOMPLETE');
// Release sockets held by the global fetch pool; all awaited requests are done.
process.exit(0);
