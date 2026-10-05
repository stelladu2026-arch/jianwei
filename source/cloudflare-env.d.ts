declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DASHSCOPE_API_KEY?: string;
    QWEN_FREE_TIER_ONLY_CONFIRMED?: string;
  }
}
