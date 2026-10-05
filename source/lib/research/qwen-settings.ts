// Server-only module. No environment values or credentials are returned to clients.
import {env} from 'cloudflare:workers';
import {isQwenCredentialConfigured,requireQwenCredentials} from './qwen-model';
import {QWEN_BASE_URL,QWEN_MODEL} from './provider-config';
export function qwenStatus(){
  const value=env.DASHSCOPE_API_KEY,key=typeof value==='string'?value.trim():'';
  const keyConfigured=isQwenCredentialConfigured(value);
  const keyChecks={present:!!value,isText:typeof value==='string',containsWhitespace:/\s/.test(key),containsQuotes:/["'“”‘’`]/.test(key),headerSafe:keyConfigured};
  const freeTierOnlyConfirmed=env.QWEN_FREE_TIER_ONLY_CONFIRMED==='true';
  // Boolean checks only: no secret characters, fragments, hashes or exact length.
  return {model:QWEN_MODEL,baseUrl:QWEN_BASE_URL,region:'北京',paidBudget:0,keyConfigured,keyChecks,freeTierOnlyConfirmed,ready:keyConfigured&&freeTierOnlyConfirmed};
}
export function qwenCredentials(confirmed:boolean){return requireQwenCredentials(env.DASHSCOPE_API_KEY,env.QWEN_FREE_TIER_ONLY_CONFIRMED==='true',confirmed);}
