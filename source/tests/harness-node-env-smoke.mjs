// Checks configuration identity only; never opens a database connection.
import assert from 'node:assert/strict';
import {env} from '../lib/deployment/node-env.ts';
const names=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN'],previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));
try{
 process.env.TURSO_DATABASE_URL='libsql://synthetic-cache-test.turso.io';process.env.TURSO_AUTH_TOKEN='synthetic-cache-token-only';
 const first=env.DB;assert.equal(env.DB,first,'one configured client must share schema initialization');
 process.env.TURSO_AUTH_TOKEN='synthetic-rotated-token-only';const second=env.DB;assert.notEqual(second,first,'credential rotation must create a new client');assert.equal(env.DB,second);
 delete process.env.TURSO_AUTH_TOKEN;assert.throws(()=>env.DB,/尚未配置/,'invalid current config cannot fall back to an old authorized client');
 console.log('PASS configured database clients are stable and credential changes invalidate them; network calls: 0.');
}finally{for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]}}
