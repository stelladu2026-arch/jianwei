import {StorageUnavailableError} from '../research/storage-errors';
type SqlValue={type:'text'|'integer'|'null';value?:string};
type Result={cols:{name:string}[];rows:SqlValue[][];affected_row_count:number};
export function tursoDatabase(url:string|undefined,token:string|undefined,fetcher:typeof fetch=fetch){
 let endpoint:URL;try{endpoint=new URL((url||'').replace(/^(libsql|turso):\/\//,'https://'));if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.turso.io')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['','/'].includes(endpoint.pathname))throw Error();endpoint.pathname='/v2/pipeline';if(!token||/[^\x21-\x7e]/.test(token))throw Error();}catch{throw new Error('Vercel 数据库尚未配置，请配置 TURSO_DATABASE_URL 与 TURSO_AUTH_TOKEN。')}
 function encode(value:unknown):SqlValue{if(value===null)return {type:'null'};if(typeof value==='string')return {type:'text',value};if(typeof value==='number'&&Number.isSafeInteger(value))return {type:'integer',value:String(value)};throw new Error('数据库参数类型不正确。')}
 function decode(value:SqlValue){if(value?.type==='null')return null;if(value?.type==='text'&&typeof value.value==='string')return value.value;if(value?.type==='integer'&&typeof value.value==='string'&&/^-?\d+$/.test(value.value)){const n=Number(value.value);if(Number.isSafeInteger(n))return n;}throw Error('INVALID_DATABASE_RESPONSE')}
 async function execute(sql:string,args:unknown[],writing:boolean){
  const body=JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(encode)}},{type:'close'}]}),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetcher(endpoint.href,{method:'POST',redirect:'manual',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,signal:controller.signal});if(!response.ok)throw Error('DATABASE_HTTP_ERROR');const data=await response.json() as {results?:{type:string;response?:{type:string;result?:Result}}[]};const result=data.results?.[0]?.response?.result;if(data.results?.length!==2||data.results[0].type!=='ok'||data.results[0].response?.type!=='execute'||data.results[1].type!=='ok'||data.results[1].response?.type!=='close'||!result||!Array.isArray(result.cols)||result.cols.some(c=>typeof c?.name!=='string')||!Array.isArray(result.rows)||!Number.isSafeInteger(result.affected_row_count)||result.affected_row_count<0)throw Error('INVALID_DATABASE_RESPONSE');const rows=result.rows.map(row=>{if(!Array.isArray(row)||row.length!==result.cols.length)throw Error('INVALID_DATABASE_RESPONSE');return Object.fromEntries(row.map((v,i)=>[result.cols[i].name,decode(v)]))});return {rows,changes:result.affected_row_count};}catch{throw new StorageUnavailableError(undefined,writing)}finally{clearTimeout(timer)}
 }
 return {
  prepare(sql:string){
   let args:unknown[]=[];
   return {
    bind(...values:unknown[]){args=values;return this},
    async all<T>(){const result=await execute(sql,args,false);return {results:result.rows as T[]}},
    async first<T>(){const result=await execute(sql,args,false);return (result.rows[0] as T|undefined)??null},
    async run(){const result=await execute(sql,args,true);return {meta:{changes:result.changes}}}
   };
  }
 };
}
