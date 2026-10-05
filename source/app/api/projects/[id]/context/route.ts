import {NextResponse} from 'next/server';
import {z} from 'zod';
import {get} from '@/lib/research/store';
import {roleContext} from '@/lib/research/governance';
const schema=z.object({role:z.enum(['coordinator','needs','commercial','verifier']),tool:z.string().max(100),revision:z.number().int().positive(),version:z.number().int().positive(),evidenceIds:z.array(z.string()).max(100)}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){try{
  if(req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
  const b=schema.parse(await req.json()),{id}=await ctx.params,p=await get(id);
  if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
  if(p.version!==b.version)return NextResponse.json({error:'项目已变更，请刷新后重试。'},{status:409});
  return NextResponse.json({context:roleContext(p,b.role,b.tool,b.revision,b.evidenceIds)});
}catch(e){const msg=e instanceof Error?e.message:'';return NextResponse.json({error:e instanceof z.ZodError?'上下文请求格式不正确':msg},{status:msg==='ROLE_PERMISSION_DENIED'?403:msg==='CONTEXT_REVISION_CONFLICT'?409:400})}}
