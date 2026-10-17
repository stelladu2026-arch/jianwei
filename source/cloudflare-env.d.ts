declare namespace Cloudflare {
  interface Env {
    SEMANTIC_RETRIEVAL_ENABLED?: string;
    EMBEDDING_FREE_TIER_ONLY_CONFIRMED?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DASHSCOPE_API_KEY?: string;
    QWEN_FREE_TIER_ONLY_CONFIRMED?: string;
  }
}
