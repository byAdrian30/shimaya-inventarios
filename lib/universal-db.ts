/**
 * Universal Database and Storage Adapter for Shimaya Ramen
 * Supports:
 *  1. Supabase / PostgreSQL (via POSTGRES_URL or DATABASE_URL)
 *  2. Supabase Client (via SUPABASE_URL + SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)
 *  3. Local SQLite fallback (using node:sqlite and datos/shimaya_inventarios.sqlite3)
 *  4. Native Cloudflare D1 and R2 when available
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

let postgresClient: any = null;
let supabaseClient: any = null;
let localSqliteDb: any = null;

function getPostgresUrl(): string | undefined {
  return process.env.POSTGRES_URL || 
         process.env.DATABASE_URL || 
         process.env.SUPABASE_DB_URL || 
         process.env.POSTGRES_PRISMA_URL;
}

function getPostgres() {
  const url = getPostgresUrl();
  if (!url) return null;
  if (!postgresClient) {
    try {
      const postgres = require('postgres');
      postgresClient = postgres(url, {
        ssl: 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
    } catch (e) {
      console.error('[universal-db] Error initializing postgres:', e);
    }
  }
  return postgresClient;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!supabaseClient) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false },
      });
    } catch (e) {
      console.error('[universal-db] Error initializing Supabase client:', e);
    }
  }
  return supabaseClient;
}

function getLocalSqlite() {
  if (localSqliteDb) return localSqliteDb;
  const candidates = [
    resolve(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite'),
    resolve(process.cwd(), '../datos/shimaya_inventarios.sqlite3'),
    resolve(process.cwd(), 'datos/shimaya_inventarios.sqlite3'),
    'C:/INVENTARIOS ALMACEN/datos/shimaya_inventarios.sqlite3',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        localSqliteDb = new DatabaseSync(p);
        return localSqliteDb;
      } catch (e) {
        console.error('[universal-db] Error opening sqlite:', p, e);
      }
    }
  }
  return null;
}

/**
 * Convert SQLite query with ? parameters to PostgreSQL $1, $2, ...
 */
function translateSqlToPostgres(sql: string, params: any[]): { sql: string; params: any[] } {
  let paramIdx = 1;
  let pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
  
  // Convert SQLite "INSERT OR IGNORE INTO table(...) VALUES(...)" to Postgres "INSERT INTO table(...) VALUES(...) ON CONFLICT DO NOTHING"
  if (/insert\s+or\s+ignore\s+into\s+([a-zA-Z0-9_]+)/i.test(pgSql)) {
    const tableMatch = pgSql.match(/insert\s+or\s+ignore\s+into\s+([a-zA-Z0-9_]+)/i);
    const table = tableMatch ? tableMatch[1] : '';
    const conflictTarget = table === 'inventory_state' ? '(id)' : 
                           table === 'team_members' ? '(email)' : 
                           table === 'inventory_costs' ? '(owner_id)' : '(id)';
    pgSql = pgSql.replace(/insert\s+or\s+ignore\s+into/i, 'INSERT INTO');
    pgSql += ` ON CONFLICT ${conflictTarget} DO NOTHING`;
  }
  
  // Format json strings to proper jsonb if target column is data
  const transformedParams = params.map(p => {
    if (typeof p === 'string' && (p.startsWith('{') || p.startsWith('['))) {
      try {
        JSON.parse(p);
        // Valid JSON string, return as is (Postgres driver handles json string to jsonb)
        return p;
      } catch (_) {}
    }
    return p;
  });

  return { sql: pgSql, params: transformedParams };
}

export function createUniversalD1() {
  return {
    prepare(rawSql: string) {
      let boundParams: any[] = [];
      const statement = {
        bind(...args: any[]) {
          boundParams = args;
          return statement;
        },
        async first<T = any>(columnName?: string): Promise<T | null> {
          const pg = getPostgres();
          if (pg) {
            const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
            const rows = await pg.unsafe(sql, params);
            if (!rows || rows.length === 0) return null;
            const row = rows[0];
            // If data is returned as object from postgres jsonb, stringify to match D1 text format
            if (row && typeof row.data === 'object' && row.data !== null) {
              row.data = JSON.stringify(row.data);
            }
            return (columnName ? row[columnName] : row) as T;
          }

          // SQLite fallback
          const sqlite = getLocalSqlite();
          if (sqlite) {
            const stmt = sqlite.prepare(rawSql);
            const row = stmt.get(...boundParams) as any;
            if (!row) return null;
            return (columnName ? row[columnName] : row) as T;
          }

          throw new Error('No hay base de datos configurada (ni PostgreSQL/Supabase ni SQLite local).');
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          const pg = getPostgres();
          if (pg) {
            const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
            const rows = await pg.unsafe(sql, params);
            const results = rows.map((r: any) => {
              if (r && typeof r.data === 'object' && r.data !== null) {
                r.data = JSON.stringify(r.data);
              }
              return r as T;
            });
            return { results };
          }

          const sqlite = getLocalSqlite();
          if (sqlite) {
            const stmt = sqlite.prepare(rawSql);
            const results = stmt.all(...boundParams) as T[];
            return { results };
          }

          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          const pg = getPostgres();
          if (pg) {
            const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
            await pg.unsafe(sql, params);
            return { success: true };
          }

          const sqlite = getLocalSqlite();
          if (sqlite) {
            const stmt = sqlite.prepare(rawSql);
            stmt.run(...boundParams);
            return { success: true };
          }

          return { success: true };
        }
      };
      return statement;
    },
    async batch(statements: any[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

export function createUniversalBucket() {
  return {
    async get(key: string) {
      // 1. Check Supabase Storage if configured
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.storage.from('archivos').download(key);
          if (!error && data) {
            const arrayBuffer = await data.arrayBuffer();
            return {
              body: Buffer.from(arrayBuffer),
              httpMetadata: { contentType: data.type || (key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') }
            };
          }
        } catch (_) {}
      }

      // 2. Fallback to local files
      const filename = key.split('/').pop() || key;
      const candidates = [
        resolve(process.cwd(), '../datos/almacen_archivos', filename),
        resolve(process.cwd(), 'datos/almacen_archivos', filename),
        resolve('C:/INVENTARIOS ALMACEN/datos/almacen_archivos', filename),
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          const bytes = readFileSync(c);
          return {
            body: bytes,
            httpMetadata: { contentType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }
          };
        }
      }
      return null;
    },
    async put(key: string, value: any, options?: any) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.storage.from('archivos').upload(key, value, {
            contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
            upsert: true
          });
        } catch (_) {}
      }

      // Local storage
      try {
        const filename = key.split('/').pop() || key;
        const dir = resolve(process.cwd(), 'datos/almacen_archivos');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, filename), Buffer.from(value));
      } catch (_) {}
      return {};
    }
  };
}
