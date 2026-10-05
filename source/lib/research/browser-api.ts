// Read JSON without displaying an authentication page or replaying a mutation.
export async function requestJSON<T>(url:string,options:RequestInit={},fetcher:typeof fetch=fetch):Promise<T>{
  const method=options.method||'GET',writing=method!=='GET';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),writing?90000:15000);
  try{
    const response=await fetcher(url,{...options,credentials:'same-origin',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json','Content-Type':'application/json',...options.headers}});
    if(response.status===401||response.status===403||response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw new Error('登录或访问权限已失效，请在独立网页重新打开见微并确认账号，再刷新项目；无需重填 API Key。');
    if(!(response.headers.get('Content-Type')||'').includes('application/json'))throw new Error('服务返回了网页而非项目数据，请重新打开见微并刷新项目。');
    let data:unknown;try{data=await response.json()}catch{throw new Error('响应不完整，请先刷新项目确认结果，再决定是否重新操作。')}
    if(!response.ok){const error=(data as {error?:unknown}|null)?.error;throw new Error(typeof error==='string'?error:'操作失败，请刷新项目后检查。')}
    return data as T;
  }catch(error){
    if(controller.signal.aborted||error instanceof TypeError)throw new Error(writing?'连接中断或响应超时，操作可能已提交。请先刷新项目或检查点确认结果，再决定是否重试；不会自动重复提交。':'读取失败或超时，请检查网络后刷新项目。');
    throw error;
  }finally{clearTimeout(timer)}
}
