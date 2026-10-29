import {databaseConfiguration, DatabaseConfigurationError} from '../lib/deployment/database-config.mjs';
import {pathToFileURL} from 'node:url';

// Fixed, read-only schema probe. Never returns credentials, row values or provider text.
export async function checkStorage(rawUrl, rawToken, fetcher = fetch) {
  let config;
  try { config = databaseConfiguration(rawUrl, rawToken); }
  catch (error) { return {code: error instanceof DatabaseConfigurationError ? error.code : 'CONFIG_CHECK_FAILED'}; }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(config.endpoint, {method:'POST', redirect:'error', signal:controller.signal,
      headers:{Authorization:'Bearer '+config.token, 'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{type:'execute',stmt:{sql:'SELECT id, version, payload, updated FROM research_projects LIMIT 0',args:[],want_rows:true}},{type:'close'}]})});
    if ([401,403].includes(response.status)) return {code:'DATABASE_AUTH_REJECTED'};
    if (response.status === 404) return {code:'DATABASE_NOT_FOUND'};
    if (!response.ok) return {code:'DATABASE_HTTP_FAILURE',status:response.status};
    let data; try { data = await response.json(); } catch { return {code:'DATABASE_RESPONSE_INVALID'}; }
    const result = data?.results?.[0];
    if (result?.type === 'error') return {code:/no such table|no such column/i.test(String(result.error?.message || '')) ? 'DATABASE_SCHEMA_MISSING' : 'DATABASE_QUERY_REJECTED'};
    if (result?.type !== 'ok' || result.response?.type !== 'execute' || !Array.isArray(result.response.result?.cols) || !Array.isArray(result.response.result?.rows) || result.response.result.rows.length !== 0) return {code:'DATABASE_RESPONSE_INVALID'};
    return {code:'DATABASE_READY',normalized:config.normalized};
  } catch { return {code:controller.signal.aborted ? 'DATABASE_TIMEOUT' : 'DATABASE_CONNECTION_FAILED'}; }
  finally { clearTimeout(timer); }
}
export function releaseReadiness(storage,environment){
 const key=environment.DASHSCOPE_API_KEY?.trim()||'';
 return {database:storage.code==='DATABASE_READY',modelKey:!!key&&!/[\s\"'“”‘’`]/.test(key),freeTierProtection:environment.QWEN_FREE_TIER_ONLY_CONFIRMED==='true',accessProtection:!!environment.JIANWEI_ACCESS_PASSWORD?.trim()};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const storage=await checkStorage(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
  console.info('[jianwei-storage-check]',JSON.stringify(storage));
  if(process.env.VERCEL_ENV){
    const checks=releaseReadiness(storage,process.env);
    console.info('[jianwei-release-readiness]',JSON.stringify(checks));
    if(Object.values(checks).some(value=>!value))process.exitCode=1;
  }
}
