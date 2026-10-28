// Fixed vocabulary only: never retain exception messages, URLs, headers or keys.
export function providerNetworkIssue(error:unknown,aborted=false){
 if(aborted)return 'provider.network:REQUEST_ABORTED';
 const codes:string[]=[],seen=new Set<unknown>();
 function visit(value:unknown,depth:number){
  if(!value||typeof value!=='object'||depth>3||seen.has(value))return;
  seen.add(value);const e=value as {code?:unknown;cause?:unknown;errors?:unknown};
  if(typeof e.code==='string')codes.push(e.code);
  visit(e.cause,depth+1);
  if(Array.isArray(e.errors))for(const child of e.errors.slice(0,8))visit(child,depth+1);
 }
 visit(error,0);
 const groups:readonly [string,readonly string[]][]=[
  ['DNS_FAILURE',['ENOTFOUND','EAI_AGAIN']],
  ['TLS_FAILURE',['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE']],
  ['CONNECT_TIMEOUT',['UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT']],
  ['HEADERS_TIMEOUT',['UND_ERR_HEADERS_TIMEOUT']],
  ['BODY_TIMEOUT',['UND_ERR_BODY_TIMEOUT']],
  ['CONNECTION_REFUSED',['ECONNREFUSED']],
  ['CONNECTION_RESET',['ECONNRESET','UND_ERR_SOCKET']],
  ['NETWORK_RESTRICTED',['EACCES','EPERM']],
 ];
 for(const [name,allowed] of groups)if(codes.some(code=>allowed.includes(code)))return 'provider.network:'+name;
 return 'provider.network:UNKNOWN';
}
