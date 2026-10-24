import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true}}return next(specifier,context)}});
const {tursoDatabase}=await import('../lib/deployment/turso-database.ts');
try{
 const db=tursoDatabase(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
 await db.prepare('CREATE TABLE IF NOT EXISTS research_projects (id TEXT PRIMARY KEY NOT NULL, version INTEGER DEFAULT 1 NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL)').run();
 console.log('研究数据表已准备。未导入历史资料、未调用模型。');
}catch{console.error('数据库初始化未完成。请核查私有连接配置及服务状态；未打印连接信息，不会自动重试。');process.exitCode=1;}
