/**
 * Cloudflare Workers runtime shim for Next.js / Vercel
 * Emulates `cloudflare:workers` and binds universal DB + BUCKET
 */

import { createUniversalD1, createUniversalBucket } from './universal-db.ts';

const universalDB = createUniversalD1();
const universalBucket = createUniversalBucket();

export const env: any = new Proxy(process.env, {
  get(target, prop: string) {
    if (prop === 'DB') return universalDB;
    if (prop === 'BUCKET') return universalBucket;
    if (prop in target) return target[prop];
    return undefined;
  }
});
