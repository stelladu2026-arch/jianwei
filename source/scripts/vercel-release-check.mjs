import {spawnSync} from 'node:child_process';
// Keep the platform build command short while preserving explicit, sequential
// checks. Public HTTP is bounded and report-only; model tests remain synthetic.
const steps=[
 [process.execPath,['--experimental-strip-types','tests/run-local-api.mjs'],{JIANWEI_TEST_SUITE:'expanded'}],
 [process.execPath,['--experimental-strip-types','scripts/check-public-sources.mjs','--live','--report-only']],
 [process.execPath,['--experimental-strip-types','tests/storage-configuration-smoke.mjs']],
 [process.execPath,['scripts/vercel-storage-check.mjs']],
 ['pnpm',['run','build:vercel']],
];
// Opt-in for one explicitly authorized deployment only. The SQL grant keeps
// the same run from obtaining another allowance if the build is restarted.
if(process.env.JIANWEI_HARNESS_LIVE_ACCEPTANCE==='1'){
 steps.push([process.execPath,['--experimental-strip-types','scripts/qwen-network-check.mjs','--live']]);
 steps.push([
 process.execPath,['--experimental-strip-types','scripts/verify-harness-live.mjs','--live','--max-model-calls=2','--paid-budget=0',
  '--run-id='+(process.env.JIANWEI_HARNESS_ACCEPTANCE_ID||''),'--ref='+(process.env.JIANWEI_HARNESS_ACCEPTANCE_REF||'')]
 ]);
}
for(const [command,args,env] of steps){
 const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,...env}});
 if(result.error){console.error('Release check could not start:',result.error.message);process.exit(1);}
 if(result.status!==0)process.exit(result.status||1);
}
