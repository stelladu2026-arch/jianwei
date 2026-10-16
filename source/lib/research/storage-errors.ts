// Keep database internals out of user copy, retaining only a bounded support reference.
export function isStorageFailure(error:unknown){return error instanceof StorageUnavailableError||/\bD1_(?:ERROR|EXEC_ERROR)\b/.test(error instanceof Error?error.message:typeof error==='string'?error:'')}
export function storageFailureMessage(error:unknown,writing:boolean){
 const message=error instanceof Error?error.message:typeof error==='string'?error:'';
 const reference=message.match(/(?:\breference\s*=|排查编号：)\s*([a-zA-Z0-9_-]{1,80})(?![a-zA-Z0-9_-])/i)?.[1];
 return (writing?'数据库服务暂时不可用，本次操作结果尚未确认。请先刷新项目或检查点，确认是否已保存或删除，再决定是否重试；不会自动重复提交。':'数据库服务暂时不可用，请稍后刷新项目。读取失败不代表项目已删除。')+(reference?' 排查编号：'+reference:'');
}
export class StorageUnavailableError extends Error{constructor(error:unknown,writing:boolean){super(storageFailureMessage(error,writing));this.name='StorageUnavailableError'}}
export async function storageOperation<T>(writing:boolean,operation:()=>Promise<T>):Promise<T>{try{return await operation()}catch(error){if(isStorageFailure(error))throw new StorageUnavailableError(error,writing);throw error}}
