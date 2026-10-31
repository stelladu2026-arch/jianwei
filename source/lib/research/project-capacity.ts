// Bounds the complete persisted project, not evidence count or model context.
// UTF-8 bytes make Chinese and ASCII use the same explicit storage budget.
export const PROJECT_PAYLOAD_BYTES=2_000_000;
export function projectPayload(value:unknown){
 const payload=JSON.stringify(value),bytes=new TextEncoder().encode(payload).byteLength;
 if(bytes>PROJECT_PAYLOAD_BYTES)throw new Error('项目完整记录超过本版 2 MB 保存上限（含原文、执行快照及历史结果）。本次修改未保存，已有记录保留；请先导出备份后整理资料，或沿用范围新建项目。');
 return payload;
}
