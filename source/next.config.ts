import type {NextConfig} from 'next';
import path from 'node:path';
const nodeEnv=path.resolve(process.cwd(),'lib/deployment/node-env.ts');
const nextConfig:NextConfig={
 poweredByHeader:false,
 turbopack:{resolveAlias:{'@/lib/deployment/runtime-env':'./lib/deployment/node-env.ts'}},
 webpack(config,{webpack}){
  config.resolve.alias={...config.resolve.alias,'@/lib/deployment/runtime-env$':nodeEnv,[path.resolve(process.cwd(),'lib/deployment/runtime-env.ts')]:nodeEnv};
  config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@\/lib\/deployment\/runtime-env$/,nodeEnv));
  return config;
 }
};
export default nextConfig;
