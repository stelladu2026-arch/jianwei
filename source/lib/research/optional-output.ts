// Fresh provider responses only. Historical results still use strict validation.
// Missing optional text carries no assertion; never remove text with citations,
// malformed objects, required content, or unknown fields.
export function omitBlankOptionalOutput(raw:unknown){
  const value=structuredClone(raw) as any,omitted:string[]=[];
  const object=(x:any)=>x&&typeof x==='object'&&!Array.isArray(x);
  const blank=(x:any)=>typeof x==='string'&&!x.trim();
  const noRefs=(x:any)=>x===undefined||Array.isArray(x)&&x.length===0;
  const proposal=value?.data?.proposal;
  if(object(proposal?.demand))for(const key of ['who','problem','effect','workaround']){
    const line=proposal.demand[key];
    const blankLine=blank(line)||object(line)&&blank(line.text)&&noRefs(line.evidence_ids)&&Object.keys(line).every(k=>['text','evidence_ids'].includes(k));
    if(blankLine&&noRefs(proposal.demand[key+'_refs'])){delete proposal.demand[key];omitted.push('data.proposal.demand.'+key);}
  }
  if(object(proposal?.interview)&&blank(proposal.interview.decision_evidence)){
    delete proposal.interview.decision_evidence;omitted.push('data.proposal.interview.decision_evidence');
  }
  return {value,normalizations:omitted.map(path=>'blank_optional_omitted:'+path)};
}
