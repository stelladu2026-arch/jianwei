import type {Proposal} from './execution';
const fields={title:'标题',problem:'研究问题',conclusion:'结论',plan:'下一步行动',counter:'反证',unknowns:'待验证项',audience:'目标人群',alternative:'现有替代'} as const;
// Read-only quality hint. Never expand, rewrite or silently rerun a saved result.
export function shortProposalFields(proposal?:Omit<Proposal,'payment'>){
 if(!proposal)return [];
 const short=Object.entries(fields).filter(([key])=>Array.from((proposal[key as keyof typeof fields]||'').trim()).length===1).map(([,label])=>label);
 return short.length>=2?short:[];
}
