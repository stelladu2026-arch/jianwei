// New rounds opt in. Persisted older rounds retain their original allowance.
export type StageBudget={modelLimit:number;modelAttempts:number;stageLimit?:2;stageAttempts?:Record<string,number>};
export function stageAttempts(budget:StageBudget,stage:string){return budget.stageAttempts?.[stage]||0;}
export function stageCeiling(budget:StageBudget,stage:string){
 return budget.stageLimit===2?Math.min(budget.modelLimit,budget.modelAttempts+Math.max(0,2-stageAttempts(budget,stage))):budget.modelLimit;
}
export function reserveStageModel(budget:StageBudget,stage:string){
 if(budget.modelAttempts>=budget.modelLimit)throw Error('MODEL_BUDGET');
 if(budget.stageLimit===2&&stageAttempts(budget,stage)>=2)throw Error('MODEL_STAGE_BUDGET');
 budget.modelAttempts++;
 if(budget.stageLimit===2)(budget.stageAttempts||={})[stage]=stageAttempts(budget,stage)+1;
}
// Explicit user preparation is required. Unknown responses and rejected model
// content are never repaired/replayed simply because a second slot remains.
export function modelRetryBlock(code:string){
 return ['PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_AUTH_ERROR','PROVIDER_FORBIDDEN','PROVIDER_CONFIG_ERROR','PROVIDER_SCHEMA_UNSUPPORTED'].includes(code)?'':'本次结果未确认或输出未通过检查，不能直接重发或修补；请保留已有成果并处理失败原因。';
}
