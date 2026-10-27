import {NextResponse,type NextRequest} from 'next/server';
import {privateDeploymentAccess} from './private-access';
export async function privateProxy(request:NextRequest,password=process.env.JIANWEI_ACCESS_PASSWORD,publicWorkspace=false){
 const access=publicWorkspace?'allowed':await privateDeploymentAccess(request.headers.get('authorization'),password);
 const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
 if(access==='unconfigured'){
  // Presence/minimum-boundary only: never return the value, exact length or hash.
  const code=password?'ACCESS_PASSWORD_TOO_SHORT':'ACCESS_PASSWORD_MISSING';
  const error=password?'访问密码不足 24 个字符，请更新 Production 环境的 JIANWEI_ACCESS_PASSWORD 并重新部署。':'生产运行环境未读取到访问密码，请核对 JIANWEI_ACCESS_PASSWORD 的 Production 配置并重新部署。';
  return NextResponse.json({error,code},{status:503,headers});
 }
 if(access==='denied')return new NextResponse('请登录见微私人研究空间。用户名为 owner，密码由空间所有者配置。',{status:401,headers:{...headers,'WWW-Authenticate':'Basic realm="Jianwei", charset="UTF-8"'}});
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){const origin=request.headers.get('origin');if(request.headers.get('sec-fetch-site')==='cross-site'||origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:'请求来源不正确。'},{status:403,headers});}
 const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Robots-Tag','noindex, nofollow');return response;
}
