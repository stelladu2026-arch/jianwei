// Qwen strict structured-output subset, checked against official documentation
// on 2026-10-15. Unsupported keywords cause HTTP 400 at the provider.
// https://www.alibabacloud.com/help/zh/model-studio/qwen-structured-output
export const unsupportedQwenKeywords=['uniqueItems','contains','minContains','maxContains','additionalItems','multipleOf','patternProperties','propertyNames'] as const;
export function providerSchemaIssues(schema:unknown){
 const issues:string[]=[];
 function walk(value:unknown,path:string){
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const node=value as Record<string,unknown>;
  for(const key of unsupportedQwenKeywords)if(Object.hasOwn(node,key))issues.push(path+'.'+key+':unsupported_keyword');
  for(const key of ['properties','$defs','definitions','dependentSchemas']){const map=node[key];if(map&&typeof map==='object'&&!Array.isArray(map))for(const [name,child] of Object.entries(map))walk(child,path+'.'+key+'.'+name)}
  for(const key of ['anyOf','allOf','oneOf','prefixItems']){const list=node[key];if(Array.isArray(list))list.forEach((child,i)=>walk(child,path+'.'+key+'.'+i))}
  for(const key of ['items','not','if','then','else','additionalProperties','unevaluatedItems','unevaluatedProperties'])walk(node[key],path+'.'+key);
 }
 walk(schema,'provider_schema');return issues.slice(0,20);
}
// Only a fixed vocabulary is retained. No raw provider message, quoted field
// value, model prompt, key fragment or arbitrary error code reaches diagnostics.
export function providerErrorIssues(status:number,body:unknown){
 const data=body as {message?:unknown;error?:{message?:unknown;code?:unknown};code?:unknown}|null;
 const message=typeof data?.error?.message==='string'?data.error.message:typeof data?.message==='string'?data.message:'';
 const issues=['provider.http:'+status];
 const code=data?.error?.code??data?.code;
 const knownCodes=['InvalidApiKey','invalid_api_key','InvalidApiKey.NotFound','InvalidApiKey.Expired','AccessDenied','AllocationQuota.FreeTierOnly'];
 if(typeof code==='string'&&knownCodes.includes(code))issues.push('provider.code:'+code);
 if(status===400||status===404)for(const key of unsupportedQwenKeywords)if(message.includes(key))issues.push('provider_schema:unsupported_keyword:'+key);
 return issues;
}
