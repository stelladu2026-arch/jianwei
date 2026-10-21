import {NextResponse} from 'next/server';
import {db,get} from '@/lib/research/store';
import {harnessStatus} from '@/lib/research/harness/status';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params,p=await get(id);
    if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
    const workflow=p.workflow;
    if(!workflow?.harnessVersion)return NextResponse.json({enabled:false});
    const threads=workflow.records.flatMap(r=>r.harnessThreadId?.startsWith(p.id+':')?[r.harnessThreadId]:[]);
    // Return counts only. Raw checkpoints contain project evidence and are
    // never exposed by this endpoint or accepted as client-supplied IDs.
    return NextResponse.json({enabled:true,version:workflow.harnessVersion,...await harnessStatus(db(),threads)});
  }catch{return NextResponse.json({error:'执行保障记录暂未读取成功，请刷新后重试。'},{status:503})}
}
