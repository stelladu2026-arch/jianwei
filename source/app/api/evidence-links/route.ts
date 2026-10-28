import {NextResponse} from 'next/server';
import {normalizeImportLinks,previewImportLink} from '@/lib/research/link-import';
export const maxDuration=60;
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'请求来源不正确'},{status:403,headers});
  const raw=await request.text();if(raw.length>10000)throw Error('输入过长。');const links=normalizeImportLinks(JSON.parse(raw).urls),results=[];
  for(let i=0;i<links.length;i+=2)results.push(...await Promise.all(links.slice(i,i+2).map(link=>previewImportLink(link))));
  return NextResponse.json({results,modelCalls:0},{headers});
 }catch{return NextResponse.json({error:'每批请输入1–6个公开链接。'},{status:400,headers});}
}
