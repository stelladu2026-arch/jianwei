export type LinkPreview={url:string;error?:string;row?:{title:string;text:string;source:string;date:string;author:string;thread:string;url:string;stance:'context';truncated:boolean;applicationNote?:string;sourceState?:'open'|'closed'}};
function destination(raw:string){
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('仅支持无账号信息的 HTTPS 链接。');u.hash='';
 if(u.hostname==='github.com'){
  const issue=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/);if(issue)return {url:u.href,target:`https://api.github.com/repos/${issue[1]}/${issue[2]}/issues/${issue[3]}`,kind:'issue'};
  const file=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/blob\/([\w.-]+)\/(.+\.(?:md|mdx|txt))$/i);if(file&&!file[4].split('/').some(s=>s==='..'||s.includes('%')))return {url:u.href,target:`https://raw.githubusercontent.com/${file[1]}/${file[2]}/${file[3]}/${file[4]}`,kind:'document'};
  throw Error('GitHub 当前支持 Issue 正文与 Markdown/TXT 文件链接。');
 }
 if(['dify.ai','www.dify.ai','docs.dify.ai','help.aliyun.com'].includes(u.hostname))return {url:u.href,target:u.href,kind:'web'};
 throw Error('此站点暂不支持自动读取，请使用文件或粘贴正文导入。当前支持 GitHub、Dify 与阿里云帮助文档。');
}
export function normalizeImportLinks(lines:unknown){if(!Array.isArray(lines)||lines.length<1||lines.length>6||lines.some(x=>typeof x!=='string'||x.length>1000))throw Error('每批请输入 1–6 个链接，每个不超过1000字符。');return [...new Set((lines as string[]).map(s=>s.trim()).filter(Boolean))];}
async function boundedText(response:Response){
 if(Number(response.headers.get('content-length'))>600000)throw Error('页面过大，请下载后按片段导入。');if(!response.body)throw Error('来源未返回正文。');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,result='';try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>600000)throw Error('页面过大，请下载后按片段导入。');result+=decoder.decode(value,{stream:true});}return result+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
}
function plain(html:string){return html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|h[1-6]|li|section)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');}
export async function previewImportLink(raw:string,fetcher:typeof fetch=fetch):Promise<LinkPreview>{
 try{
  const d=destination(raw),response=await fetcher(d.target,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:d.kind==='issue'?'application/vnd.github+json':'text/html,text/plain', 'User-Agent':'Jianwei-Link-Import/1'}});
  if(response.status>=300&&response.status<400)throw Error('来源发生重定向，未跟随；请粘贴最终公开链接。');if(!response.ok)throw Error(`来源读取失败（HTTP ${response.status}），可手动补正文。`);
  const rawText=await boundedText(response);let title='',text='',date='',author='',source='',truncated=false,applicationNote='',sourceState:'open'|'closed'|undefined;
  if(d.kind==='issue'){
   const item=JSON.parse(rawText);if(typeof item.body!=='string'||typeof item.title!=='string'||item.body.trim().length<40||item.pull_request)throw Error('未取得有效 Issue 正文。');
   if(item.user?.type==='Bot')throw Error('此 Issue 作者为机器人，请核查后手动导入。');
   title=item.title;date=typeof item.created_at==='string'?item.created_at.slice(0,10):'';author=typeof item.user?.login==='string'?item.user.login:'';
   source='GitHub Issue · 作者正文，不含评论';text=item.body;sourceState=item.state==='closed'?'closed':'open';applicationNote='应用提示：来源为作者单方公开报告，未经独立核实；不含评论。Issue 关闭不代表一定已修复，此提示不是作者或官方原话。';
  }else if(d.kind==='document'){title=rawText.match(/^#\s+(.+)$/m)?.[1]||new URL(d.url).pathname.split('/').at(-1)||'公开文档';text=rawText;source='GitHub 文档 · 原始文件';}
  else{const type=response.headers.get('content-type')||'';if(!/text\/html|text\/plain/i.test(type))throw Error('来源不是可读取的文本网页。');title=plain(rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'公开网页');const main=rawText.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1];if(!main)throw Error('无法可靠定位网页正文，请手动复制相关段落。');text=plain(main);source=new URL(d.url).hostname+' · 网页抽取片段，非全文保证';truncated=true;}
  if(text.trim().length<40)throw Error('可读取正文不足，请手动补充。');truncated=truncated||text.length>8000;
  return {url:d.url,row:{title:title.slice(0,200),text:text.slice(0,8000),date,author:author.slice(0,100),source,thread:d.url.slice(0,200),url:d.url,stance:'context',truncated,...(applicationNote?{applicationNote}:{}),...(sourceState?{sourceState}:{})}};
 }catch(e){return {url:raw,error:e instanceof Error&&e.name==='TimeoutError'?'读取超时，未自动重试。':e instanceof Error&&e.name==='TypeError'?'来源连接失败，请手动补充或稍后显式重试。':e instanceof Error?e.message:'读取失败。'};}
}
