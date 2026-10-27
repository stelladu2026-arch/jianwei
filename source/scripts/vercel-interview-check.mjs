import {checkStorage} from './vercel-storage-check.mjs';
// Deployment preflight: metadata only, no row values and no model calls.
const password=process.env.JIANWEI_ACCESS_PASSWORD;
if(!password||password.length<24){console.error('[interview-preflight] ACCESS_PASSWORD_UNCONFIGURED');process.exit(1)}
const storage=await checkStorage(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
console.info('[interview-preflight]',storage.code);
if(storage.code!=='DATABASE_READY')process.exit(1);
console.info('[interview-preflight] Ready; no data writes or model requests.');
