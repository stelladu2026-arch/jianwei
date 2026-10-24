// Cloudflare target; standard Next.js resolves this module to node-env.ts.
export {env} from 'cloudflare:workers';

export const deploymentTarget:string='cloudflare';
