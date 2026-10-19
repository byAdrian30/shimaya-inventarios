import { getChatGPTUser } from '../../../chatgpt-auth';

function getRawUrl(): string | undefined {
  return process.env.POSTGRES_URL || 
         process.env.DATABASE_URL || 
         process.env.SUPABASE_DB_URL || 
         process.env.POSTGRES_PRISMA_URL;
}

function adaptUrl(url: string, poolerPort = 6543): string {
  const m = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?\/(.+)$/);
  if (m) {
    const [, proto, user, pass, ref, rest] = m;
    const poolerUser = user.includes('.') ? user : `${user}.${ref}`;
    return `${proto}${poolerUser}:${pass}@aws-0-us-east-1.pooler.supabase.com:${poolerPort}/${rest}`;
  }
  return url;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await getChatGPTUser();
  if (!u) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const rawUrl = getRawUrl();
  const hasPostgres = Boolean(rawUrl);
  let postgresConnected = false;
  let postgresTables: string[] = [];
  let errorMsg = '';
  let rowCount = 0;
  let connectedVia = '';

  if (hasPostgres) {
    const postgres = require('postgres');
    // Try raw url first, then pooler 6543, then pooler 5432
    const candidates = [
      { name: 'raw', url: rawUrl! },
      { name: 'pooler-6543', url: adaptUrl(rawUrl!, 6543) },
      { name: 'pooler-5432', url: adaptUrl(rawUrl!, 5432) }
    ];

    for (const cand of candidates) {
      try {
        const sql = postgres(cand.url, {
          ssl: 'require',
          max: 1,
          idle_timeout: 5,
          connect_timeout: 5,
        });
        const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        postgresTables = rows.map((r: any) => r.table_name);
        
        const countRes = await sql`SELECT count(*) FROM inventory_state`;
        rowCount = Number(countRes[0]?.count || 0);
        postgresConnected = true;
        connectedVia = cand.name;
        await sql.end();
        errorMsg = '';
        break;
      } catch (e) {
        errorMsg += `[${cand.name}: ${(e as Error).message}] `;
      }
    }
  }

  return Response.json({
    hasPostgresConfigured: hasPostgres,
    postgresConnected,
    connectedVia,
    postgresTables,
    rowCount,
    error: errorMsg || undefined,
    envKeysPresent: [
      process.env.POSTGRES_URL ? 'POSTGRES_URL' : null,
      process.env.DATABASE_URL ? 'DATABASE_URL' : null,
      process.env.SUPABASE_DB_URL ? 'SUPABASE_DB_URL' : null,
      process.env.POSTGRES_PRISMA_URL ? 'POSTGRES_PRISMA_URL' : null,
    ].filter(Boolean)
  }, { headers: { 'Cache-Control': 'no-store' } });
}
