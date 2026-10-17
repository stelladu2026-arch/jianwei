import type {Analysis} from './execution';
import {literalQuoteStart} from './collaboration';
// Pure validation shared by live execution and local stage reports.
export function assertLiteralCitations(citations:Analysis['citations'],evidence:{id:string;text:string}[],diagnose?:(issues:string[])=>void){
 if(!citations?.length)return;
 const issues:string[]=[];
 citations.forEach((citation,index)=>{const source=evidence.find(item=>item.id===citation.evidence_id);if(literalQuoteStart(source?.text,citation.quote)<0)issues.push(`data.citations.${index}.quote:not_in_input`);});
 if(issues.length){diagnose?.(issues);throw new Error('INVALID_EVIDENCE_QUOTE');}
}
