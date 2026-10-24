import {isStorageFailure,storageFailureMessage} from '@/lib/research/storage-errors';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {newProject} from '@/lib/research/domain';
import {list,listSummaries,create} from '@/lib/research/store';
import {qwenStatus} from '@/lib/research/qwen-settings';
export async function GET(request:Request){
  // Same authenticated entry as project loading; status reads never query D1,
  // mutate projects, or contact Qwen. Dispatch retains the private Site policy.
  if(new URL(request.url).searchParams.get('view')==='model-status')return NextResponse.json({modelStatus:qwenStatus()},{headers:{'Cache-Control':'private, no-store'}});
  try{return NextResponse.json({projects:new URL(request.url).searchParams.get('view')==='summary'?await listSummaries():await list()},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return NextResponse.json({error:isStorageFailure(e)?storageFailureMessage(e,false):'暂时无法读取项目，请重试。'},{status:503})}
}
const schema=z.object({demo:z.boolean().optional(),title:z.string().trim().min(1).max(100),audience:z.string().max(500).default(''),region:z.string().max(100).default(''),period:z.string().max(100).default('近一年'),exclusions:z.string().max(500).default(''),decision:z.string().max(1000).default('')});
export async function POST(req:Request){try{if(req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});const b=schema.parse(await req.json());return NextResponse.json({project:await create(newProject(b,b.demo))})}catch(e){return NextResponse.json({error:isStorageFailure(e)?storageFailureMessage(e,true):e instanceof z.ZodError?'请检查必填内容和输入长度。':'创建失败，请稍后重试。'},{status:isStorageFailure(e)?503:400})}}
