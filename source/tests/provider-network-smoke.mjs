import assert from 'node:assert/strict';
import {providerNetworkIssue} from '../lib/research/provider-network.ts';
let checks=0;
for(const [code,name] of [['ENOTFOUND','DNS_FAILURE'],['EAI_AGAIN','DNS_FAILURE'],['ERR_TLS_CERT_ALTNAME_INVALID','TLS_FAILURE'],['UND_ERR_CONNECT_TIMEOUT','CONNECT_TIMEOUT'],['UND_ERR_HEADERS_TIMEOUT','HEADERS_TIMEOUT'],['UND_ERR_BODY_TIMEOUT','BODY_TIMEOUT'],['ECONNREFUSED','CONNECTION_REFUSED'],['ECONNRESET','CONNECTION_RESET'],['UND_ERR_SOCKET','CONNECTION_RESET'],['EPERM','NETWORK_RESTRICTED']]){assert.equal(providerNetworkIssue({message:'PRIVATE_KEY',cause:{code}}),'provider.network:'+name);checks++;}
assert.equal(providerNetworkIssue({cause:{errors:[{code:'ECONNRESET'}]}}),'provider.network:CONNECTION_RESET');checks++;
assert.equal(providerNetworkIssue({code:'PRIVATE_KEY',message:'PRIVATE_PROMPT'}),'provider.network:UNKNOWN');checks++;
assert.equal(providerNetworkIssue({code:'ECONNRESET'},true),'provider.network:REQUEST_ABORTED');checks++;
const cyclic={code:'PRIVATE_KEY'};cyclic.cause=cyclic;assert.equal(providerNetworkIssue(cyclic),'provider.network:UNKNOWN');checks++;
const error={cause:{errors:Array.from({length:9},(_,i)=>({code:i===8?'ECONNRESET':'PRIVATE_KEY'}))}};assert.equal(providerNetworkIssue(error),'provider.network:UNKNOWN');checks++;
console.log(JSON.stringify({provider_network_checks:checks,real_http_requests:0,real_model_calls:0}));
