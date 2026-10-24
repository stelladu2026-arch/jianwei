import {z} from 'zod';
import type {ModelTask} from './model-port';
export const FACT_FORMAT='source-quote/1';
export type SourceQuote={id:string;evidence_id:string;quote:string};
export function sourceQuoteCatalog(evidence:ModelTask['evidence'],choices:(items:ModelTask['evidence'])=>string[],ids?:readonly string[]):SourceQuote[]{
 const result:SourceQuote[]=[];
 for(const item of evidence){const e=item as {id?:unknown};if(typeof e.id!=='string'||ids&&!ids.includes(e.id))continue;for(const quote of choices([item]))result.push({id:'Q'+(result.length+1),evidence_id:e.id,quote});}
 return result;
}
const selected=z.object({kind:z.literal('fact'),quote_id:z.string().max(20)}).strict();
const factCheck=z.object({target:z.string().max(40),judgment:z.literal('supports'),reason:z.string().trim().min(1).max(240)}).strict();
// New explicit wire protocol: selected source IDs generate literal statements
// and proof. Legacy free-text facts are never rewritten or rescued.
export function expandSourceFacts(raw:unknown,catalog:SourceQuote[],review:boolean,diagnose?:(issues:string[])=>void){
 const r=structuredClone(raw) as any;
 if(!r||typeof r!=='object'||Array.isArray(r))return r;
 const notes=r.data?.notes;if(!Array.isArray(notes))return r;
 const hasSelection=notes.some(n=>n&&typeof n==='object'&&Object.prototype.hasOwnProperty.call(n,'quote_id'));
 if(!hasSelection){if(r.fact_format!==undefined&&r.fact_format!==FACT_FORMAT){diagnose?.(['fact_format:unknown']);throw new Error('INVALID_MODEL_OUTPUT');}delete r.fact_format;return r;}
 function reject(issue:string):never{diagnose?.([issue]);throw new Error('INVALID_MODEL_OUTPUT');}
 if(r.fact_format!==FACT_FORMAT)reject('fact_format:required_for_selection');
 if(!review){if(notes.length>2)reject('data.notes:source_selection_limit');if(!Array.isArray(r.data.citations)||r.data.citations.length>2)reject('data.citations:source_selection_limit');}
 const added:{evidence_id:string;quote:string}[]=[];
 r.data.notes=notes.map((n:any,i:number)=>{
  if(!n||typeof n!=='object'||!Object.prototype.hasOwnProperty.call(n,'quote_id'))return n;
  const parsed=selected.safeParse(n);if(!parsed.success)reject(`data.notes.${i}:invalid_source_selection`);
  const choice=catalog.find(q=>q.id===parsed.data.quote_id);if(!choice)reject(`data.notes.${i}.quote_id:not_in_input`);
  const anchor={evidence_id:choice.evidence_id,quote:choice.quote};
  if(review){
   if(!Array.isArray(r.data.checks))reject('data.checks:required');
   const matches=r.data.checks.map((c:any,j:number)=>({c,j})).filter(({c}:any)=>c?.target==='note:'+i);
   if(matches.length!==1)reject('data.checks:claim_count_mismatch');
   const check=factCheck.safeParse(matches[0].c);if(!check.success)reject(`data.checks.${matches[0].j}:invalid_selected_fact_check`);
   r.data.checks[matches[0].j]={...check.data,anchors:[anchor]};
   return {kind:'fact',claim:choice.quote};
  }
  added.push(anchor);return {kind:'fact',claim:choice.quote,refs:[choice.evidence_id]};
 });
 if(!review&&added.length){if(!Array.isArray(r.data.citations))reject('data.citations:required');r.data.citations=[...r.data.citations,...added.filter(a=>!r.data.citations.some((c:any)=>c?.evidence_id===a.evidence_id&&c?.quote===a.quote))];}
 delete r.fact_format;return r;
}
