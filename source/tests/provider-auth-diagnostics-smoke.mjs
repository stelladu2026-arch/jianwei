import assert from 'node:assert/strict';
import {providerErrorIssues} from '../lib/research/qwen-schema.ts';
assert.deepEqual(providerErrorIssues(401,{error:{code:'InvalidApiKey',message:'PRIVATE_KEY uniqueItems'}}),['provider.http:401','provider.code:InvalidApiKey']);
assert.deepEqual(providerErrorIssues(401,{error:{code:'PRIVATE_KEY',message:'PRIVATE_PROMPT'}}),['provider.http:401']);
assert.deepEqual(providerErrorIssues(400,{error:{message:'PRIVATE_PROMPT uniqueItems contains'}}),['provider.http:400','provider_schema:unsupported_keyword:uniqueItems','provider_schema:unsupported_keyword:contains']);
assert.deepEqual(providerErrorIssues(403,{code:'AllocationQuota.FreeTierOnly'}),['provider.http:403','provider.code:AllocationQuota.FreeTierOnly']);
console.log('4 sanitized provider diagnostic checks passed; actual model calls: 0');
