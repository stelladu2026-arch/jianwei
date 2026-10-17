import {QWEN_BASE_URL} from './provider-config';
import {isQwenCredentialConfigured} from './qwen-model';
import {retrieveProjectEvidence,type RetrievalHit} from './retrieval';
import type {Evidence} from './domain';

export const EMBEDDING_MODEL='text-embedding-v4';
export type EmbeddingReceipt={requests:number;input_tokens?:number;model:string};
export interface EmbeddingAdapter{embed(texts:string[]):Promise<number[][]>}
export class QwenEmbedding implements EmbeddingAdapter{
  receipt:EmbeddingReceipt={requests:0,model:EMBEDDING_MODEL};
  private key:string;private confirmed:boolean;private fetcher:typeof fetch;
  constructor(key:string,confirmed:boolean,fetcher:typeof fetch=fetch){this.key=key;this.confirmed=confirmed;this.fetcher=fetcher;}
  async embed(texts:string[]){
    if(!this.confirmed||!isQwenCredentialConfigured(this.key))throw new Error('EMBEDDING_NOT_CONFIGURED');
    if(!texts.length||texts.length>10||texts.some(t=>!t.trim()||t.length>1200))throw new Error('EMBEDDING_INPUT_LIMIT');
    this.receipt.requests++;
    let response:Response;
    try{response=await this.fetcher(QWEN_BASE_URL+'/embeddings',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify({model:EMBEDDING_MODEL,input:texts,dimensions:256,encoding_format:'float'})});}
    catch{throw new Error('PROVIDER_NETWORK_ERROR');}
    if(response.status>=300&&response.status<400)throw new Error('PROVIDER_REDIRECT_REJECTED');
    if(!response.ok)throw new Error(response.status===403?'EMBEDDING_FORBIDDEN':'PROVIDER_UNAVAILABLE');
    const body=await response.json() as {data?:{index:number;embedding:number[]}[];usage?:{prompt_tokens?:number}};
    const tokens=body.usage?.prompt_tokens;
    if(Number.isInteger(tokens)&&tokens!>=0&&tokens!<=100000)this.receipt.input_tokens=tokens;
    if(!Array.isArray(body.data)||body.data.length!==texts.length||new Set(body.data.map(x=>x.index)).size!==texts.length)throw new Error('INVALID_EMBEDDING_RESPONSE');
    const rows=[...body.data].sort((a,b)=>a.index-b.index);
    if(rows.some((x,i)=>x.index!==i||!Array.isArray(x.embedding)||x.embedding.length!==256||!x.embedding.every(Number.isFinite)||!x.embedding.some(n=>n!==0)))throw new Error('INVALID_EMBEDDING_RESPONSE');
    return rows.map(x=>x.embedding);
  }
}

export function cosine(a:number[],b:number[]){
  if(!a.length||a.length!==b.length||![...a,...b].every(Number.isFinite))throw new Error('INVALID_EMBEDDING_RESPONSE');
  const norm=Math.sqrt(a.reduce((s,x)=>s+x*x,0)*b.reduce((s,x)=>s+x*x,0));
  if(!norm)throw new Error('INVALID_EMBEDDING_RESPONSE');
  return a.reduce((s,x,i)=>s+x*b[i],0)/norm;
}

// Small-project bounded hybrid search. Full input remains in the project;
// coverage and clipping travel with hits rather than claiming a global index.
export async function retrieveSemanticEvidence(evidence:Evidence[],query:string,adapter:EmbeddingAdapter):Promise<RetrievalHit[]>{
  const eligible=evidence.filter(e=>!e.excluded&&e.kind!=='synthetic'&&e.text.length>=40&&!/^该(帖子|条目)只有标题/.test(e.text));
  const selected=eligible.slice(0,8);
  if(!query.trim()||!selected.length)return [];
  const texts=selected.map(e=>e.text.slice(0,900));
  const vectors=await adapter.embed([query.slice(0,160),...texts]);
  if(vectors.length!==texts.length+1)throw new Error('INVALID_EMBEDDING_RESPONSE');
  const lexical=new Map(retrieveProjectEvidence(selected,query).map((h,i)=>[h.id,i+1]));
  const semantic=selected.map((e,i)=>({e,i,score:cosine(vectors[0],vectors[i+1])})).sort((a,b)=>b.score-a.score||a.e.id.localeCompare(b.e.id));
  return semantic.map((row,index)=>({...row,rank:1/(60+index+1)+(lexical.has(row.e.id)?1/(60+lexical.get(row.e.id)!):0)})).filter(row=>row.score>=0.2||lexical.has(row.e.id)).sort((a,b)=>b.rank-a.rank||b.score-a.score).slice(0,4).map(row=>({id:row.e.id,title:row.e.title.slice(0,150),text:texts[row.i],mode:'hybrid',score:row.score,coverage:{indexed:selected.length,eligible:eligible.length},truncated:row.e.text.length>900}));
}
