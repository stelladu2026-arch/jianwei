// Minimal HTTP boundary for the isolated Harness acceptance command. Production
// continues to use its existing D1/Turso facade; this module reads no env itself.
import type {HarnessDatabase,HarnessStatement} from './storage';
type Value={type:string;value?:string|number};
function encode(value:unknown):Value{
 if(value===null)return {type:'null'};
 if(typeof value==='string')return {type:'text',value};
 if(typeof value==='number'&&Number.isFinite(value))return Number.isSafeInteger(value)?{type:'integer',value:String(value)}:{type:'float',value};
 throw Error('HARNESS_STORAGE_ARGUMENT');
}
function decode(value:Value){
 if(value.type==='null')return null;
 if(value.type==='integer'||value.type==='float')return Number(value.value);
 if(value.type==='text')return value.value;
 throw Error('HARNESS_STORAGE_RESPONSE');
}
export function createHarnessTursoDatabase(options:{url:string;token:string;fetch?:typeof fetch}):HarnessDatabase{
 const url=new URL(options.url.replace(/^libsql:/,'https:'));
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||!/(?:^|\.)turso\.io$/.test(url.hostname)||!options.token||/\s/.test(options.token))throw Error('HARNESS_STORAGE_CONFIGURATION');
 const transport=options.fetch||fetch;
 return {prepare(sql:string):HarnessStatement{
  let args:unknown[]=[];
  async function execute(){
   try{
    const response=await transport(`${url.origin}/v2/pipeline`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+options.token,'Content-Type':'application/json'},body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(encode)}},{type:'close'}]})});
    if(!response.ok)throw Error('HARNESS_STORAGE_UNAVAILABLE');
    const body=await response.json() as {results?:{type:string;response?:{type:string;result:{cols:{name:string}[];rows:Value[][];affected_row_count:number}}}[]},result=body.results?.[0];
    if(result?.type!=='ok'||result.response?.type!=='execute')throw Error('HARNESS_STORAGE_RESPONSE');
    const data=result.response.result;
    if(!Array.isArray(data.cols)||!Array.isArray(data.rows)||!Number.isFinite(Number(data.affected_row_count)))throw Error('HARNESS_STORAGE_RESPONSE');
    return {rows:data.rows.map((row:Value[])=>Object.fromEntries(data.cols.map((col:{name:string},i:number)=>[col.name,decode(row[i])]))),changes:Number(data.affected_row_count)};
   }catch{throw Error('HARNESS_STORAGE_UNAVAILABLE');}
  }
  return {bind(...values){args=values;return this},async first<T>(){return (await execute()).rows[0] as T||null},async all<T>(){return {results:(await execute()).rows as T[]}},async run(){return {meta:{changes:(await execute()).changes}}}};
 }};
}
