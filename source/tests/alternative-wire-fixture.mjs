// Mock provider responses opt into the current wire. No production response is repaired.
export function unknownAlternativeWire(raw){
 if(!raw?.data?.proposal)return raw;
 const value=structuredClone(raw);
 if(value.alternative_format===undefined&&Object.hasOwn(value.data.proposal,'alternative')){delete value.data.proposal.alternative;value.alternative_format='quote-or-unknown/1';value.data.proposal.alternative_quote_id='UNKNOWN_ALTERNATIVE';}
 if(!value.review_format&&value.proposal_basis_format===undefined){value.proposal_basis_format='proposal-basis/1';value.data.proposal.basis_quote_ids={problem:[],conclusion:[],counter:[]};}
 return value;
}
