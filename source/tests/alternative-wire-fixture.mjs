// Mock provider responses opt into the current wire. No production response is repaired.
export function unknownAlternativeWire(raw){
 if(!raw?.data?.proposal||raw.alternative_format!==undefined||!Object.hasOwn(raw.data.proposal,'alternative'))return raw;
 const value=structuredClone(raw);delete value.data.proposal.alternative;
 value.alternative_format='quote-or-unknown/1';value.data.proposal.alternative_quote_id='UNKNOWN_ALTERNATIVE';
 return value;
}
