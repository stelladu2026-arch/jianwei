import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {componentURL} from './render-component.mjs';
import {newProject} from '../lib/research/domain.ts';
import {create,save} from '../lib/research/store.ts';
import {toProjectSummary,mergeProjectSummaries,updateProjectSummary} from '../lib/research/project-summary.ts';
import {projectDeskState} from '../lib/research/project-desk-state.ts';
import {requestJSON} from '../lib/research/browser-api.ts';
import {tursoDatabase} from '../lib/deployment/turso-database.ts';
import {sqliteTursoTransport} from './turso-sqlite-transport.mjs';
const {ResearchProjectRegister}=await import(componentURL(new URL('../components/research-desk.tsx',import.meta.url)));
const {ResearchOverviewPulse}=await import(componentURL(new URL('../components/research-overview-pulse.tsx',import.meta.url)));
const env=globalThis.__testEnv,priorDB=env.DB,sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE research_projects (id TEXT PRIMARY KEY,version INTEGER NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL)');
const transport=sqliteTursoTransport(sqlite),statements=[],responseBytes=[];
env.DB=tursoDatabase('libsql://synthetic-test.turso.io','synthetic-turso-token-only',async(url,init)=>{
 statements.push(JSON.parse(init.body).requests[0].stmt.sql);const response=await transport(url,init);responseBytes.push(await response.clone().text());return response;
});
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const now=new Date().toISOString(),checkpoint={status:'completed',revision:1,evidenceVersion:0,created:now};
const api=async path=>{const response=await globalThis.__apiTestFetch('http://test.local'+path,{method:'GET'});return {response,data:await response.json()}};
try{
 let p=newProject({title:'Synthetic directory performance regression',audience:'Synthetic teams'});p.confirmed=true;p.status='reviewing';
 p.evidence=[{id:'E1',text:'PRIVATE_ORIGINAL_MARKER'.repeat(6000),kind:'public',excluded:false},{id:'E2',text:'Excluded original',kind:'public',excluded:true},{id:'E3',text:'Synthetic original',kind:'synthetic',excluded:false}];
 p.opportunities=[{id:'O1',status:'draft',stale:false},{id:'O2',status:'draft',stale:true},{id:'O3',status:'confirmed',stale:false}];
 p.workflow={...checkpoint,conclusionAudit:{...checkpoint,status:'ready',created:new Date(Date.now()+1000).toISOString()},records:[{input:{text:'PRIVATE_TRACE_MARKER'.repeat(5000)}}]};p.reports=[{body:'PRIVATE_REPORT_MARKER'.repeat(5000)}];p=await create(p);
 await check('overview response and SQL HTTP transport omit all project bodies and preserve actual counts',async()=>{
  const {response,data}=await api('/api/projects?view=summary');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(data.projects.length,1);const summary=data.projects[0],body=JSON.stringify(data),wire=responseBytes.at(-1);
  assert.ok(statements.at(-1).includes('json_object'));assert.ok(!/^SELECT payload/.test(statements.at(-1)));for(const marker of ['PRIVATE_ORIGINAL_MARKER','PRIVATE_TRACE_MARKER','PRIVATE_REPORT_MARKER']){assert.ok(!body.includes(marker));assert.ok(!wire.includes(marker));}
  assert.equal(summary.summaryVersion,1);assert.deepEqual(summary.counts,{evidence:3,usable:1,opportunities:3,drafts:1});assert.equal(summary.archived,false);assert.equal(summary.confirmed,true);assert.equal(typeof summary.workflow,'object');assert.equal(typeof summary.workflow.conclusionAudit,'object');assert.equal(summary.workflow.records,undefined);assert.equal(summary.evidence,undefined);assert.equal(summary.reports,undefined);assert.ok(Buffer.byteLength(wire)<3000);assert.ok(Buffer.byteLength(body)/Buffer.byteLength(JSON.stringify(p))<0.01);
 });
 await check('opening a selected project still returns its complete current detail and legacy list remains compatible',async()=>{
  const detail=await api('/api/projects/'+p.id);assert.equal(detail.response.status,200);assert.equal(detail.data.project.evidence[0].text,p.evidence[0].text);assert.equal(detail.data.project.workflow.records[0].input.text,p.workflow.records[0].input.text);const legacy=await api('/api/projects');assert.equal(legacy.data.projects[0].reports[0].body,p.reports[0].body);
 });
 await check('lightweight and full directory states agree for current checkpoints and expired leases',async()=>{
  for(const status of ['ready','running','failed','paused','stale','partial','completed']){
   const q=structuredClone(p);q.workflow={...checkpoint,status,lease:{expires:new Date(Date.now()+60000).toISOString()}};q.run={...checkpoint,status:'completed'};const summary=toProjectSummary(q);assert.deepEqual(projectDeskState(summary),projectDeskState(q));assert.deepEqual(projectDeskState(summary,Date.now()+120000),projectDeskState(q,Date.now()+120000));
   const originalId=q.id;q.id=crypto.randomUUID();q.updated='2099-01-01T00:00:00.000Z';await create(q);const stored=(await api('/api/projects?view=summary')).data.projects.find(x=>x.id===q.id);assert.deepEqual(projectDeskState(stored),projectDeskState(q));assert.deepEqual(projectDeskState(stored,Date.now()+120000),projectDeskState(q,Date.now()+120000));sqlite.prepare('DELETE FROM research_projects WHERE id=?').run(q.id);q.id=originalId;
   q.workflow.revision=0;assert.deepEqual(projectDeskState(toProjectSummary(q)),projectDeskState(q));
  }
  assert.equal(projectDeskState((await api('/api/projects?view=summary')).data.projects[0]).label,'复核待继续');
 });
 await check('overview and directory render the same counts and destinations from lightweight rows',async()=>{
  const summary=(await api('/api/projects?view=summary')).data.projects[0],render=(Component,project)=>renderToStaticMarkup(React.createElement(Component,{projects:[project],onOpen:()=>{throw Error('render must not navigate')}}));assert.equal(render(ResearchProjectRegister,summary),render(ResearchProjectRegister,p));assert.equal(render(ResearchOverviewPulse,summary),render(ResearchOverviewPulse,p));
 });
 await check('refresh cannot downgrade a newer mutation or recreate a deleted project',()=>{
  const summary=toProjectSummary(p),newer={...summary,version:summary.version+2,title:'New title'},older={...summary,title:'Old title'};assert.deepEqual(mergeProjectSummaries([newer],[older]),[newer]);assert.deepEqual(updateProjectSummary([],p,true),[]);assert.equal(updateProjectSummary([newer],p,true)[0].title,'New title');assert.equal(updateProjectSummary([summary],{...p,version:newer.version,title:newer.title})[0].version,newer.version);assert.deepEqual(mergeProjectSummaries([summary],[]),[]);
 });
 await check('directory reads reflect later changes and archived booleans without fetching full payloads',async()=>{
  p.archived=true;p.title='Updated synthetic title';p.opportunities.pop();p=await save(p,p.version);const summary=(await api('/api/projects?view=summary')).data.projects[0];assert.equal(summary.archived,true);assert.equal(summary.title,p.title);assert.equal(summary.version,p.version);assert.equal(summary.counts.opportunities,2);assert.equal(projectDeskState(summary).label,'已归档');
 });
 await check('superseded detail read receives caller cancellation and does not trigger any retry',async()=>{
  const controller=new AbortController();let calls=0,received;
  const pending=requestJSON('/api/projects/synthetic',{signal:controller.signal},async(_url,init)=>{calls++;received=init.signal;return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))});controller.abort();await assert.rejects(pending);assert.equal(received.aborted,true);assert.equal(calls,1);
 });
 console.log(`Project overview summaries: ${passed} checks passed; real model/source requests: 0.`);
}finally{env.DB=priorDB;sqlite.close()}
