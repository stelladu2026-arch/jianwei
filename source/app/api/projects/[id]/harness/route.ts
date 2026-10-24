import {NextResponse} from 'next/server';
import {db,get} from '@/lib/research/store';
import {stageRecovery} from '@/lib/research/harness/recovery';
import {backgroundStatus} from '@/lib/research/harness/background';
import {harnessStatus} from '@/lib/research/harness/status';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params,p=await get(id);
    if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
    const workflow=p.workflow;
    if(!workflow?.harnessVersion)return NextResponse.json({enabled:false});
    const threads=workflow.records.flatMap(r=>r.harnessThreadId===`${p.id}:${workflow.id}:${r.id}`?[r.harnessThreadId]:[]);
    // Return counts only. Raw checkpoints contain project evidence and are
    // never exposed by this endpoint or accepted as client-supplied IDs.
    const background=await backgroundStatus(db(),id);
    return NextResponse.json({enabled:true,active:workflow.status==='running',version:workflow.harnessVersion,recovery:await stageRecovery(db(),p),background:background?.runId===workflow.id?background:null,...await harnessStatus(db(),threads)});
  }catch{return NextResponse.json({error:'执行保障记录暂未读取成功，请刷新后重试。'},{status:503})}
}
