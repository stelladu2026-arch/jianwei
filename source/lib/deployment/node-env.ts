import {tursoDatabase} from './turso-database';
import {databaseConfiguration} from './database-config.mjs';
let database:ReturnType<typeof tursoDatabase>|undefined;
let configuredUrl='',configuredToken='';
function configuredDatabase(){
 const {url,token}=databaseConfiguration(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
 if(!database||url!==configuredUrl||token!==configuredToken){
  database=tursoDatabase(url,token);configuredUrl=url;configuredToken=token;
 }
 return database;
}
// Replaces cloudflare:workers only in the standard Next.js target. No key is public.
export const env={
 get BOCHA_API_KEY(){return process.env.BOCHA_API_KEY},
 get BOCHA_SEARCH_ENABLED(){return process.env.BOCHA_SEARCH_ENABLED},
 get GITHUB_DISCUSSIONS_TOKEN(){return process.env.GITHUB_DISCUSSIONS_TOKEN},
 get GITHUB_DISCUSSIONS_ENABLED(){return process.env.GITHUB_DISCUSSIONS_ENABLED},
 get RESEARCH_COMMUNITIES(){return process.env.RESEARCH_COMMUNITIES},
 get TAVILY_API_KEY(){return process.env.TAVILY_API_KEY},
 get WEB_SEARCH_ENABLED(){return process.env.WEB_SEARCH_ENABLED},
 JIANWEI_RUNTIME:'node',
 get DB(){return configuredDatabase()},
 get DASHSCOPE_API_KEY(){return process.env.DASHSCOPE_API_KEY},
 get QWEN_FREE_TIER_ONLY_CONFIRMED(){return process.env.QWEN_FREE_TIER_ONLY_CONFIRMED},
 get SEMANTIC_RETRIEVAL_ENABLED(){return process.env.SEMANTIC_RETRIEVAL_ENABLED},
 get EMBEDDING_FREE_TIER_ONLY_CONFIRMED(){return process.env.EMBEDDING_FREE_TIER_ONLY_CONFIRMED}
};

export const deploymentTarget:string='node';
