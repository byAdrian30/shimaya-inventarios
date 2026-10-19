import { getChatGPTUser } from '../../../chatgpt-auth';

function getPostgresUrl(): string | undefined {
  return process.env.POSTGRES_URL || 
         process.env.DATABASE_URL || 
         process.env.SUPABASE_DB_URL || 
         process.env.POSTGRES_PRISMA_URL;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await getChatGPTUser();
  if (!u) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const url = getPostgresUrl();
  const hasPostgres = Boolean(url);
  let postgresConnected = false;
  let postgresTables: string[] = [];
  let errorMsg = '';
  let rowCount = 0;

  if (hasPostgres) {
    try {
      const postgres = require('postgres');
      const sql = postgres(url!, {
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
      await sql.end();
    } catch (e) {
      errorMsg = (e as Error).message;
    }
  }

  return Response.json({
    hasPostgresConfigured: hasPostgres,
    postgresConnected,
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
