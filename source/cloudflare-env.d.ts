declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DASHSCOPE_API_KEY?: string;
    SEMANTIC_RETRIEVAL_ENABLED?: string;
    EMBEDDING_FREE_TIER_ONLY_CONFIRMED?: string;
    QWEN_FREE_TIER_ONLY_CONFIRMED?: string;
  }
}
