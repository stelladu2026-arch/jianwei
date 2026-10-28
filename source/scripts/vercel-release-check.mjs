import {spawnSync} from 'node:child_process';
// Keep the platform build command short while preserving explicit, sequential
// checks. Public HTTP is bounded and report-only; model tests remain synthetic.
// Diagnostic branch only: one empty-JSON authentication probe, no generation.
const steps=[
 [process.execPath,['--experimental-strip-types','scripts/qwen-network-check.mjs','--live','--auth']],
 [process.execPath,['--experimental-strip-types','tests/run-local-api.mjs'],{JIANWEI_TEST_SUITE:'expanded'}],
 [process.execPath,['--experimental-strip-types','scripts/check-public-sources.mjs','--live','--report-only']],
 [process.execPath,['--experimental-strip-types','tests/storage-configuration-smoke.mjs']],
 [process.execPath,['scripts/vercel-storage-check.mjs']],
 ['pnpm',['run','build:vercel']],
];
// A full production candidate must have its existing private access and storage.
if(process.env.VERCEL_ENV==='production')steps.unshift([process.execPath,['scripts/vercel-interview-check.mjs']]);
// This isolated diagnostic build never runs real model acceptance.
for(const [command,args,env] of steps){
 const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,...env}});
 if(result.error){console.error('Release check could not start:',result.error.message);process.exit(1);}
 if(result.status!==0)process.exit(result.status||1);
}
