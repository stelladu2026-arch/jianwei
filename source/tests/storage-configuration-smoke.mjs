import assert from 'node:assert/strict';
import {databaseConfiguration,DatabaseConfigurationError} from '../lib/deployment/database-config.mjs';
import {checkStorage} from '../scripts/vercel-storage-check.mjs';
import {isStorageFailure,storageFailureMessage,storageOperation} from '../lib/research/storage-errors.ts';
const url='libsql://test.example.turso.io',token='synthetic-token';
let checks=0; const check=(fn)=>{fn();checks++};
for(const [u,t,code] of [[undefined,token,'DATABASE_URL_MISSING'],[url,undefined,'DATABASE_TOKEN_MISSING'],[' ',token,'DATABASE_URL_MISSING'],[url,'\n','DATABASE_TOKEN_MISSING'],['https://evil.example',token,'DATABASE_URL_INVALID'],['https://ok.turso.io@evil.example',token,'DATABASE_URL_INVALID'],['https://test.turso.io/?secret=do-not-print',token,'DATABASE_URL_INVALID'],[url,'Bearer synthetic-token','DATABASE_TOKEN_INVALID'],[url,'"synthetic-token"','DATABASE_TOKEN_INVALID'],[url,'synthetic token','DATABASE_TOKEN_INVALID']]) {
 check(()=>assert.throws(()=>databaseConfiguration(u,t),error=>error instanceof DatabaseConfigurationError&&error.code===code&&!error.message.includes('do-not-print')));
 const error=(()=>{try{databaseConfiguration(u,t)}catch(e){return e}})();
 check(()=>assert.equal(isStorageFailure(error),true));
 await assert.rejects(()=>storageOperation(false,async()=>{throw error}), e=>isStorageFailure(e)&&storageFailureMessage(e,false)===error.message);checks++;
}
const config=databaseConfiguration(' \n'+url+'\n','\n'+token+'\n');
check(()=>assert.equal(config.url,url));check(()=>assert.equal(config.token,token));check(()=>assert.equal(config.normalized,true));
check(()=>assert.equal(config.endpoint,'https://test.example.turso.io/v2/pipeline'));
for(const variant of ['https://test.example.turso.io','turso://test.example.turso.io'])check(()=>assert.equal(databaseConfiguration(variant,token).endpoint,config.endpoint));
let calls=0;
const mock=async(endpoint,request)=>{calls++;assert.equal(endpoint,config.endpoint);assert.equal(request.headers.Authorization,'Bearer '+token);assert.equal(request.redirect,'error');const body=JSON.parse(request.body);assert.equal(body.requests.length,2);assert.equal(body.requests[0].stmt.sql,'SELECT id, version, payload, updated FROM research_projects LIMIT 0');assert.deepEqual(body.requests[0].stmt.args,[]);return {ok:true,status:200,json:async()=>({results:[{type:'ok',response:{type:'execute',result:{cols:[{name:'id'}],rows:[]}}}]})}};
check(()=>assert.equal(calls,0));assert.deepEqual(await checkStorage(' '+url,' '+token,mock),{code:'DATABASE_READY',normalized:true});checks++;check(()=>assert.equal(calls,1));
assert.deepEqual(await checkStorage(undefined,token,mock),{code:'DATABASE_URL_MISSING'});checks++;check(()=>assert.equal(calls,1));
for(const status of [401,403]){assert.deepEqual(await checkStorage(url,token,async()=>({status,ok:false})),{code:'DATABASE_AUTH_REJECTED'});checks++;}
assert.deepEqual(await checkStorage(url,token,async()=>({status:404,ok:false})),{code:'DATABASE_NOT_FOUND'});checks++;
assert.deepEqual(await checkStorage(url,token,async()=>({status:503,ok:false})),{code:'DATABASE_HTTP_FAILURE',status:503});checks++;
const result=await checkStorage(url,token,async()=>({status:200,ok:true,json:async()=>({results:[{type:'error',error:{message:'no such table: research_projects private-content'}}]})}));check(()=>assert.deepEqual(result,{code:'DATABASE_SCHEMA_MISSING'}));check(()=>assert.equal(JSON.stringify(result).includes('private-content'),false));
assert.deepEqual(await checkStorage(url,token,async()=>{throw Error('sensitive-provider-text')}),{code:'DATABASE_CONNECTION_FAILED'});checks++;
assert.deepEqual(await checkStorage(url,token,async()=>({status:200,ok:true,json:async()=>({results:[{type:'ok',response:{type:'execute',result:{cols:[],rows:[['private-row']]}}}]})})),{code:'DATABASE_RESPONSE_INVALID'});checks++;
console.log(checks+' storage configuration and read-only diagnostic checks PASS; no live database or model requests.');