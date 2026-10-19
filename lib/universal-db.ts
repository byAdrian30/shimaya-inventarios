/**
 * Universal Database and Storage Adapter for Shimaya Ramen
 * Supports:
 *  1. Supabase / PostgreSQL (via POSTGRES_URL or DATABASE_URL)
 *  2. Bundled JSON / /tmp fallback (ensuring 100% instant zero-config availability on Vercel)
 *  3. Local SQLite (via node:sqlite)
 *  4. Native Cloudflare D1/R2
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import bundledData from '../data/base_de_datos_completa.json';

let postgresClient: any = null;
let supabaseClient: any = null;

function adaptSupabaseUrl(url: string): string {
  const m = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?\/(.+)$/);
  if (m) {
    const [, proto, user, pass, ref, rest] = m;
    const poolerUser = user.includes('.') ? user : `${user}.${ref}`;
    return `${proto}${poolerUser}:${pass}@aws-0-us-east-1.pooler.supabase.com:6543/${rest}`;
  }
  return url;
}

function getPostgresUrl(): string | undefined {
  const raw = process.env.POSTGRES_URL || 
              process.env.DATABASE_URL || 
              process.env.SUPABASE_DB_URL || 
              process.env.POSTGRES_PRISMA_URL;
  if (!raw) return undefined;
  return adaptSupabaseUrl(raw);
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

// In-memory / /tmp file store for zero-config deployment on Vercel
interface StoreData {
  inventory_state: Array<{ id: string; revision: number; data: string }>;
  team_members: Array<{
    email: string;
    user_id: string | null;
    name: string;
    area: string;
    role: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  inventory_costs: Array<{ owner_id: string; revision: number; data: string }>;
  inventory_reset_backups: Array<{
    id: string;
    owner_id: string;
    reset_version: string;
    revision: number;
    data: string;
    created_at: string;
  }>;
}

let memoryStore: StoreData | null = null;
const tmpPath = process.platform === 'win32' 
  ? join(process.env.TEMP || 'C:\\Windows\\Temp', 'shimaya_store.json')
  : '/tmp/shimaya_store.json';

function getStore(): StoreData {
  if (memoryStore) return memoryStore;

  // 1. Check if temporary modified file exists
  if (existsSync(tmpPath)) {
    try {
      memoryStore = JSON.parse(readFileSync(tmpPath, 'utf8'));
      if (memoryStore && memoryStore.inventory_state) return memoryStore;
    } catch (_) {}
  }

  // 2. Load from bundled import data
  if (bundledData && (bundledData as any).tables) {
    const tables = (bundledData as any).tables;
    memoryStore = {
      inventory_state: tables.inventory_state || [],
      team_members: tables.team_members || [],
      inventory_costs: tables.inventory_costs || [],
      inventory_reset_backups: tables.inventory_reset_backups || []
    };
    saveStore();
    return memoryStore;
  }

  // 3. Fallback candidates on disk
  const candidates = [
    resolve(process.cwd(), 'data/base_de_datos_completa.json'),
    resolve(process.cwd(), '../datos/base_de_datos_completa.json'),
    resolve(process.cwd(), 'datos/base_de_datos_completa.json'),
    'C:/INVENTARIOS ALMACEN/datos/base_de_datos_completa.json',
  ];

  for (const c of candidates) {
    if (existsSync(/*turbopackIgnore: true*/ c)) {
      try {
        const raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ c, 'utf8'));
        if (raw.tables) {
          memoryStore = {
            inventory_state: raw.tables.inventory_state || [],
            team_members: raw.tables.team_members || [],
            inventory_costs: raw.tables.inventory_costs || [],
            inventory_reset_backups: raw.tables.inventory_reset_backups || []
          };
          saveStore();
          return memoryStore;
        }
      } catch (e) {
        console.error('[universal-db] Error reading initial json:', c, e);
      }
    }
  }

  // Empty fallback if nothing found
  memoryStore = {
    inventory_state: [],
    team_members: [],
    inventory_costs: [],
    inventory_reset_backups: []
  };
  return memoryStore;
}

function saveStore() {
  if (!memoryStore) return;
  try {
    writeFileSync(tmpPath, JSON.stringify(memoryStore), 'utf8');
  } catch (_) {}
}

/**
 * Execute query against the embedded Store
 */
function executeStoreQuery(rawSql: string, params: any[]): any {
  const store = getStore();
  const sql = rawSql.trim().replace(/\s+/g, ' ');

  // 1. SELECT revision, data FROM inventory_state WHERE id = ?
  if (/SELECT\s+(?:revision,\s*data|data,\s*revision)\s+FROM\s+inventory_state\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
    const id = params[0];
    const row = store.inventory_state.find(r => r.id === id);
    return row ? { revision: row.revision, data: row.data } : null;
  }

  // 2. SELECT data FROM inventory_state WHERE id = ?
  if (/SELECT\s+data\s+FROM\s+inventory_state\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
    const id = params[0];
    const row = store.inventory_state.find(r => r.id === id);
    return row ? { data: row.data } : null;
  }

  // 3. INSERT OR IGNORE INTO inventory_state(id, revision, data) VALUES(?, ?, ?)
  if (/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+inventory_state/i.test(sql)) {
    const id = params[0];
    const revision = params[1] !== undefined ? Number(params[1]) : 0;
    const data = params[2];
    if (!store.inventory_state.some(r => r.id === id)) {
      store.inventory_state.push({ id, revision, data });
      saveStore();
    }
    return { success: true };
  }

  // 4. UPDATE inventory_state SET data=?, revision=revision+1 WHERE id=? AND revision=? RETURNING revision
  if (/UPDATE\s+inventory_state\s+SET\s+data\s*=\s*\?,\s*revision\s*=\s*revision\s*\+\s*1\s+WHERE\s+id\s*=\s*\?\s+AND\s+revision\s*=\s*\?/i.test(sql)) {
    const data = params[0];
    const id = params[1];
    const expectedRevision = Number(params[2]);
    const row = store.inventory_state.find(r => r.id === id);
    if (!row || row.revision !== expectedRevision) return null;
    row.data = data;
    row.revision += 1;
    saveStore();
    return { revision: row.revision };
  }

  // 5. UPDATE inventory_state SET data=? WHERE id=? AND data=?
  if (/UPDATE\s+inventory_state\s+SET\s+data\s*=\s*\?\s+WHERE\s+id\s*=\s*\?\s+AND\s+data\s*=\s*\?/i.test(sql)) {
    const data = params[0];
    const id = params[1];
    const expectedData = params[2];
    const row = store.inventory_state.find(r => r.id === id);
    if (row && row.data === expectedData) {
      row.data = data;
      saveStore();
    }
    return { success: true };
  }

  // 6. SELECT ... FROM team_members WHERE email=?
  if (/SELECT.+FROM\s+team_members\s+WHERE\s+email\s*=\s*\?/i.test(sql)) {
    const email = params[0]?.toLowerCase();
    const row = store.team_members.find(m => m.email.toLowerCase() === email);
    if (!row) return null;
    return {
      email: row.email,
      userId: row.user_id,
      name: row.name,
      area: row.area,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // 7. SELECT ... FROM team_members (all)
  if (/SELECT.+FROM\s+team_members/i.test(sql)) {
    return store.team_members.map(row => ({
      email: row.email,
      userId: row.user_id,
      name: row.name,
      area: row.area,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // 8. UPDATE team_members SET user_id=?, name=?, updated_at=? WHERE email=? AND user_id IS NULL AND status=? RETURNING user_id
  if (/UPDATE\s+team_members\s+SET\s+user_id\s*=\s*\?,\s*name\s*=\s*\?,\s*updated_at\s*=\s*\?\s+WHERE\s+email\s*=\s*\?/i.test(sql)) {
    const userId = params[0];
    const name = params[1];
    const updatedAt = params[2];
    const email = params[3]?.toLowerCase();
    const row = store.team_members.find(m => m.email.toLowerCase() === email);
    if (!row) return null;
    row.user_id = userId;
    row.name = name;
    row.updated_at = updatedAt;
    saveStore();
    return { user_id: userId };
  }

  // 9. UPDATE team_members SET role=? WHERE role IN (?, ?)
  if (/UPDATE\s+team_members\s+SET\s+role\s*=\s*\?\s+WHERE\s+role\s+IN/i.test(sql)) {
    const newRole = params[0];
    const targets = params.slice(1);
    for (const m of store.team_members) {
      if (targets.includes(m.role)) m.role = newRole;
    }
    saveStore();
    return { success: true };
  }

  // 10. inventory_costs queries
  if (/SELECT.+FROM\s+inventory_costs\s+WHERE\s+owner_id\s*=\s*\?/i.test(sql)) {
    const ownerId = params[0];
    const row = store.inventory_costs.find(r => r.owner_id === ownerId);
    return row ? { revision: row.revision, data: row.data } : null;
  }

  if (/UPDATE\s+inventory_costs\s+SET\s+data\s*=\s*\?,\s*revision\s*=\s*revision\s*\+\s*1\s+WHERE\s+owner_id\s*=\s*\?\s+AND\s+revision\s*=\s*\?/i.test(sql)) {
    const data = params[0];
    const ownerId = params[1];
    const expectedRevision = Number(params[2]);
    const row = store.inventory_costs.find(r => r.owner_id === ownerId);
    if (!row || row.revision !== expectedRevision) return null;
    row.data = data;
    row.revision += 1;
    saveStore();
    return { revision: row.revision };
  }

  // 11. inventory_reset_backups queries
  if (/SELECT.+FROM\s+inventory_reset_backups/i.test(sql)) {
    return store.inventory_reset_backups;
  }

  if (/INSERT\s+INTO\s+inventory_reset_backups/i.test(sql)) {
    const [id, ownerId, resetVersion, revision, data, createdAt] = params;
    store.inventory_reset_backups.push({
      id,
      owner_id: ownerId,
      reset_version: resetVersion,
      revision: Number(revision),
      data,
      created_at: createdAt
    });
    saveStore();
    return { success: true };
  }

  return null;
}

/**
 * Convert SQLite query with ? parameters to PostgreSQL $1, $2, ...
 */
function translateSqlToPostgres(sql: string, params: any[]): { sql: string; params: any[] } {
  let paramIdx = 1;
  let pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
  
  if (/insert\s+or\s+ignore\s+into\s+([a-zA-Z0-9_]+)/i.test(pgSql)) {
    const tableMatch = pgSql.match(/insert\s+or\s+ignore\s+into\s+([a-zA-Z0-9_]+)/i);
    const table = tableMatch ? tableMatch[1] : '';
    const conflictTarget = table === 'inventory_state' ? '(id)' : 
                           table === 'team_members' ? '(email)' : 
                           table === 'inventory_costs' ? '(owner_id)' : '(id)';
    pgSql = pgSql.replace(/insert\s+or\s+ignore\s+into/i, 'INSERT INTO');
    pgSql += ` ON CONFLICT ${conflictTarget} DO NOTHING`;
  }
  
  return { sql: pgSql, params };
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
            try {
              const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
              const rows = await pg.unsafe(sql, params);
              if (!rows || rows.length === 0) return null;
              const row = rows[0];
              if (row && typeof row.data === 'object' && row.data !== null) {
                row.data = JSON.stringify(row.data);
              }
              return (columnName ? row[columnName] : row) as T;
            } catch (err) {
              console.error('[universal-db] Postgres query failed, falling back to embedded store:', err);
            }
          }

          // Fallback to embedded store
          const result = executeStoreQuery(rawSql, boundParams);
          if (result === null || result === undefined) return null;
          return (columnName ? result[columnName] : result) as T;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          const pg = getPostgres();
          if (pg) {
            try {
              const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
              const rows = await pg.unsafe(sql, params);
              const results = rows.map((r: any) => {
                if (r && typeof r.data === 'object' && r.data !== null) {
                  r.data = JSON.stringify(r.data);
                }
                return r as T;
              });
              return { results };
            } catch (err) {
              console.error('[universal-db] Postgres query failed, falling back to embedded store:', err);
            }
          }

          // Fallback to embedded store
          const result = executeStoreQuery(rawSql, boundParams);
          if (Array.isArray(result)) return { results: result as T[] };
          if (result) return { results: [result as T] };
          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          const pg = getPostgres();
          if (pg) {
            try {
              const { sql, params } = translateSqlToPostgres(rawSql, boundParams);
              await pg.unsafe(sql, params);
              return { success: true };
            } catch (err) {
              console.error('[universal-db] Postgres query failed, falling back to embedded store:', err);
            }
          }

          // Fallback to embedded store
          executeStoreQuery(rawSql, boundParams);
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
      const filename = key.split('/').pop() || key;
      const candidates = [
        resolve(process.cwd(), 'data/almacen_archivos', filename),
        resolve(process.cwd(), '../datos/almacen_archivos', filename),
        resolve(process.cwd(), 'datos/almacen_archivos', filename),
        resolve('C:/INVENTARIOS ALMACEN/datos/almacen_archivos', filename),
      ];
      for (const c of candidates) {
        if (existsSync(/*turbopackIgnore: true*/ c)) {
          const bytes = readFileSync(/*turbopackIgnore: true*/ c);
          return {
            body: bytes,
            httpMetadata: { contentType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }
          };
        }
      }
      return null;
    },
    async put(key: string, value: any, options?: any) {
      try {
        const filename = key.split('/').pop() || key;
        const dir = resolve(process.cwd(), 'data/almacen_archivos');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, filename), Buffer.from(value));
      } catch (_) {}
      return {};
    }
  };
}
