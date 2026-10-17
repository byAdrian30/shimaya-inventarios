declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CLEAN_LAUNCH_RESET_TOKEN?: string;
    OPENING_STOCK_TOKEN?: string;
    READ_ONLY_SHARE_TOKEN?: string;
    FULL_SITE_EXPORT_TOKEN?: string;
  }
}
