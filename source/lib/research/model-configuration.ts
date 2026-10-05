// Browser-safe, read-only metadata. Never calls a provider or accepts a key.
export type ModelConfiguration={keyConfigured:boolean;freeTierOnlyConfirmed:boolean;ready:boolean};
export const MODEL_CONFIGURATION_PATH='/api/projects?view=model-status';
export async function readModelConfiguration(fetcher:typeof fetch=fetch):Promise<ModelConfiguration>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetcher(MODEL_CONFIGURATION_PATH,{method:'GET',credentials:'same-origin',redirect:'manual',headers:{Accept:'application/json','Content-Type':'application/json'},signal:controller.signal});
    if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw new Error('见微登录授权需要更新，请在独立网页打开见微完成授权，再刷新模型配置。');
    if(response.status===401||response.status===403)throw new Error(`模型配置读取未获授权（HTTP ${response.status}）。请在独立网页打开见微，确认登录账号后刷新配置；无需重填 API Key。`);
    if(!response.ok)throw new Error(`暂时无法读取模型配置（HTTP ${response.status}），请点击“刷新模型配置”重试。`);
    if(!(response.headers.get('Content-Type')||'').includes('application/json'))throw new Error('模型配置返回了非数据页面。请在独立网页打开见微后刷新配置；无需重填 API Key。');
    let data:unknown;try{data=await response.json()}catch{throw new Error('模型配置响应不完整，请点击“刷新模型配置”重试。')}
    const status=(data as {modelStatus?:ModelConfiguration}|null)?.modelStatus;
    if(!status||typeof status.keyConfigured!=='boolean'||typeof status.freeTierOnlyConfirmed!=='boolean'||typeof status.ready!=='boolean'||status.ready!==(status.keyConfigured&&status.freeTierOnlyConfirmed))throw new Error('模型配置响应格式异常，请点击“刷新模型配置”重试。');
    // Ignore additional fields; no provider/private error content reaches UI.
    return {keyConfigured:status.keyConfigured,freeTierOnlyConfirmed:status.freeTierOnlyConfirmed,ready:status.ready};
  }catch(error){
    if(controller.signal.aborted)throw new Error('读取模型配置超时，请点击“刷新模型配置”重试。');
    if(error instanceof TypeError)throw new Error('连接见微失败，请检查网络后点击“刷新模型配置”。');
    throw error;
  }finally{clearTimeout(timer)}
}
