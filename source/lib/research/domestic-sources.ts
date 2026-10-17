// Browser-safe configuration. These are node subscriptions, not keyword search.
export const V2EX_NODES={programmer:'程序员',create:'分享创造',qna:'问与答'} as const;
export type V2exNode=keyof typeof V2EX_NODES;
export type SourceProfile='public'|'v2ex';
export function isV2exNode(value:unknown):value is V2exNode{return typeof value==='string'&&Object.hasOwn(V2EX_NODES,value)}
export const domesticErrors:Record<string,string>={SOURCE_REDIRECT_REJECTED:'来源返回跳转，本轮未跟随。可稍后手动重开或导入原文。',SOURCE_429:'来源限流。请稍后再采集，已有资料保留。',SOURCE_403:'来源拒绝访问。可从有权使用的原文导入，不自动绕过限制。',SOURCE_BAD_FEED:'订阅正文格式不符合约定，未采纳该响应。',SOURCE_TOO_LARGE:'来源响应过大，本轮停止读取。',SOURCE_FAILURE:'暂时无法读取来源。可稍后采集或导入原文。'};
