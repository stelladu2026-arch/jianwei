import type {Project,Opportunity} from './domain';
import type {Run} from './execution';

// Runs are not user confirmations. Create exactly one separately labelled draft
// only after delivery, in the same project CAS as the completed run.
export function saveOpportunityDraft(p:Project,run:Run){
  if(run.simulation||run.status!=='completed')return;
  if(p.opportunities.some(o=>o.sourceRunId===run.id))return;
  const proposal=run.tasks.find(t=>t.role==='coordinator')?.output?.data.proposal;
  if(!proposal||proposal.refs.some(id=>!p.evidence.some(e=>e.id===id&&!e.excluded)))throw new Error('INVALID_MODEL_REFERENCE');
  if(p.opportunities.length>=100)throw new Error('OPPORTUNITY_CAPACITY');
  const {demand:_demand,interview:_interview,...fields}=proposal;
  const card:Opportunity={...fields,id:'draft:'+run.id,revision:p.revision,stale:false,status:'draft',sourceRunId:run.id,sourceEvidenceVersion:run.evidenceVersion,reviewReason:'自动生成的机会草稿，尚未人工确认；公开言论不构成交易核验。'};
  p.opportunities.push(card);
}
