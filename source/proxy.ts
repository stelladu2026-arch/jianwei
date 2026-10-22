import {NextResponse,type NextRequest} from 'next/server';
import {deploymentTarget} from '@/lib/deployment/runtime-env';
import {privateProxy} from './lib/deployment/private-proxy';
export async function proxy(request:NextRequest){
 // Existing Sites authentication remains the Cloudflare target's authority.
 if(deploymentTarget!=='node')return NextResponse.next();
 return privateProxy(request,process.env.JIANWEI_ACCESS_PASSWORD);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.svg).*)']};
