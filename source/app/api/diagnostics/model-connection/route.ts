import {NextResponse} from 'next/server';
import {env} from '@/lib/deployment/runtime-env';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {readGenerationDiagnostic,runGenerationDiagnostic} from '@/lib/research/generation-diagnostic';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(){
 try{const database=env.DB;if(!database)throw Error('DIAGNOSTIC_DATABASE_REQUIRED');return NextResponse.json(await readGenerationDiagnostic(database),{headers})}
 catch{return NextResponse.json({state:'diagnostic_storage_unavailable',modelRequestAttempts:null,requestAttemptsThisInvocation:0},{status:503,headers})}
}
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin)return NextResponse.json({state:'same_origin_required'},{status:403,headers});
 if(process.env.VERCEL_ENV!=='production'||!/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||''))return NextResponse.json({state:'authorized_runtime_required',modelRequestAttempts:0},{status:403,headers});
 let key:string;try{key=qwenCredentials(true)}catch{return NextResponse.json({state:'credential_or_free_tier_protection_not_ready',modelRequestAttempts:0},{status:409,headers})}
 try{const database=env.DB;if(!database)throw Error('DIAGNOSTIC_DATABASE_REQUIRED');return NextResponse.json(await runGenerationDiagnostic({db:database,key,buildRef:process.env.VERCEL_GIT_COMMIT_SHA!}),{headers})}
 catch{return NextResponse.json({state:'diagnostic_storage_unconfirmed',note:'Do not retry generation. Read the saved diagnostic status.',requestAttemptsThisInvocation:null},{status:503,headers})}
}
