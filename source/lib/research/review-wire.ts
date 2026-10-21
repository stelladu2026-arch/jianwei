import {claimKinds,claimKindLabels} from './claim-kinds';
import {z} from 'zod';
import type {Role} from './model-port';
import {checkSchema,disagreementSchema} from './review-contract';

// Versioned provider representation: each claim's sources are declared once,
// in its anchors. Saved results keep the existing internal/UI representation.
export const REVIEW_FORMAT='claim-anchors/1';
const str=z.string().trim().min(1).max(2000);
const note=z.object({claim:str,kind:z.enum(claimKinds)}).strict();
const proposal=z.object({title:str,problem:str,audience:str,alternative:str,conclusion:str,decision:z.enum(['validate','evidence','pause']),payment:z.enum(['none','weak','medium']),counter:str,unknowns:str,plan:str}).strict();
export function decodeReviewWire(raw:unknown,role:Role,diagnose?:(issues:string[])=>void){
  const common={notes:z.array(note).min(1).max(2),checks:z.array(checkSchema).max(4)};
  const commonData=z.object(common).strict(),coordinatorData=z.object({...common,proposal,disagreements:z.array(disagreementSchema).max(2)}).strict();
  const data=role==='coordinator'?coordinatorData:commonData;
  const parsed=z.object({review_format:z.literal(REVIEW_FORMAT),status:z.enum(['ok','partial']),data,gaps:z.array(z.string().max(2000)).max(20)}).strict().safeParse(raw);
  if(!parsed.success){diagnose?.(parsed.error.issues.slice(0,20).map(i=>(i.path.join('.')||'root')+':'+i.code));throw new Error('INVALID_MODEL_OUTPUT');}
  const wire=parsed.data,d=wire.data as z.infer<typeof commonData>&Partial<z.infer<typeof coordinatorData>>;
  const refsFor=(targets:string[])=>[...new Set(d.checks.filter(c=>targets.includes(c.target)).flatMap(c=>c.anchors.map(a=>a.evidence_id)))];
  const notes=d.notes.map((n,i)=>({...n,refs:refsFor(['note:'+i])}));
  const p=d.proposal?{...d.proposal,refs:refsFor(['proposal:problem','proposal:conclusion'])}:undefined;
  const disagreements=d.disagreements;
  const evidence_ids=[...new Set([...notes.flatMap(n=>n.refs),...(p?.refs||[]),...(disagreements||[]).flatMap(x=>x.refs)])];
  // Never change a target, judgment, ID or quotation. Strict result validation
  // and locateChecks must still reject foreign IDs, gaps and nonliteral quotes.
  return {status:wire.status,data:{notes,checks:d.checks,...(p?{proposal:p,disagreements}: {})},evidence_ids,gaps:wire.gaps};
}
