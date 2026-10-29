import assert from 'node:assert/strict';
import {collectBocha,collectDiscussions,collectCommunity} from '../lib/research/additional-channels.ts';
import {collectConfiguredPublic,publicSourceStatus} from '../lib/research/configured-sources.ts';
const date=new Date().toISOString(),body='Dify citation missing in published applications and reproduction details. '.repeat(2);
let calls=0;const no=async()=>{calls++;throw Error('unexpected')};
for(const run of [collectBocha,collectDiscussions]){assert.equal((await run('Dify citation',null,1,'',no)).requests,0);assert.equal((await run('Dify citation',null,0,'fake',no)).requests,0);}assert.equal(calls,0);
console.log('PASS new credential channels make zero requests when disabled or capped');
const bocha=await collectBocha('Dify citation',null,1,'fixture',async(url,init)=>{assert.equal(url,'https://api.bocha.cn/v1/web-search');assert.equal(init.redirect,'manual');assert.equal(JSON.parse(init.body).count,4);return Response.json({code:200,data:{webPages:{value:[{url:'https://example.org/report',name:'Dify citation',summary:body,datePublished:date},{url:'http://127.0.0.1/',summary:body}]}}})});assert.equal(bocha.evidence.length,1);assert.equal(bocha.evidence[0].contentBasis,'excerpt');assert.equal(bocha.requests,1);
console.log('PASS Bocha summaries remain excerpts and no result URLs are fetched');
const url='https://github.com/langgenius/dify/discussions/1',reply={url:url+'#discussioncomment-2',body,createdAt:date,author:{__typename:'User',login:'human'}};
const discussions=await collectDiscussions('Dify citation',null,1,'fixture',async(address,init)=>{assert.equal(address,'https://api.github.com/graphql');assert.ok(JSON.parse(init.body).query.includes('type:DISCUSSION'));return Response.json({data:{search:{nodes:[{url,title:'Dify citation',body,createdAt:date,author:{__typename:'User'},answer:reply,comments:{nodes:[reply,{...reply,url:url+'#discussioncomment-3',author:{__typename:'Bot'}}]}}]}}})});assert.equal(discussions.evidence.length,2);assert.ok(discussions.evidence.every(e=>e.thread===url));assert.equal(discussions.requests,1);
console.log('PASS Discussions deduplicate accepted answers, filter bots, and preserve threads');
assert.equal((await collectDiscussions('Dify',null,1,'fixture',async()=>Response.json({errors:[{message:'secret data'}]}))).sourceDetails[0].code,'SOURCE_DISCUSSIONS_UNAVAILABLE');
let count=0;const community=await collectCommunity('Dify citation',null,2,'n8n',async address=>{count++;assert.ok(String(address).startsWith('https://community.n8n.io/'));return Response.json(count===1?{topics:[{id:9},{id:10}]}:{id:9,title:'Dify citation',post_stream:{posts:[{id:12,post_number:1,user_id:2,cooked:body,created_at:date}]}})});assert.equal(count,2);assert.equal(community.requests,2);assert.equal(community.evidence.length,1);assert.equal(community.limited,true);
assert.equal((await collectCommunity('x',null,3,'bad',no)).requests,0);
console.log('PASS community destinations are allowlisted and topic reads obey budget');
const env=globalThis.__testEnv,saved={...env},previous=globalThis.fetch;
try{Object.assign(env,{BOCHA_API_KEY:'hidden-fixture',BOCHA_SEARCH_ENABLED:'true',GITHUB_DISCUSSIONS_TOKEN:'hidden-fixture',GITHUB_DISCUSSIONS_ENABLED:'true',RESEARCH_COMMUNITIES:'n8n,n8n,invalid',TAVILY_API_KEY:'hidden-fixture',WEB_SEARCH_ENABLED:'true'});assert.equal(publicSourceStatus().bochaReady,true);assert.deepEqual(publicSourceStatus().communities,['n8n']);assert.ok(!JSON.stringify(publicSourceStatus()).includes('hidden-fixture'));
for(const cap of [0,1,2,4,6,10]){let actual=0;globalThis.fetch=async()=>{actual++;return Response.json({})};const result=await collectConfiguredPublic('Dify citation',null,cap);assert.equal(result.requests,actual);assert.ok(actual<=cap);assert.equal(result.sourceDetails.reduce((n,r)=>n+r.requests,0),actual);}
}finally{globalThis.fetch=previous;for(const key of Object.keys(env))if(!(key in saved))delete env[key];Object.assign(env,saved);}
console.log('PASS all configured channels share exact request accounting without exposing keys');
