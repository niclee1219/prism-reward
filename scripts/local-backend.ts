// Runs the Edge Function router under Node against a local Postgres.
// Used for development (npm run backend:local) and by the backend tests and load test.
import { createServer, type Server } from 'node:http';
import pg from 'pg';
import { handle, type Deps } from '../supabase/functions/_shared/router.ts';

export const LOCAL_DB = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/prism';
const ROUTES = ['submit-run', 'leaderboard', 'reactions', 'status', 'vote', 'email', 'admin', 'claim-name'];

export function makeDeps(pool: pg.Pool, adminPin: string): Deps {
  return {
    adminPin,
    async rpc(fn, args) {
      if (!/^prism_\w+$/.test(fn)) throw new Error('bad function name');
      const keys = Object.keys(args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const res = await pool.query(sql, keys.map((k) => args[k]));
      return res.rows[0].r;
    },
  };
}

export function startLocalBackend(port: number, adminPin: string, databaseUrl = LOCAL_DB): { server: Server; pool: pg.Pool; deps: Deps } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
  const deps = makeDeps(pool, adminPin);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const route = url.pathname.split('/').filter(Boolean)[0] ?? '';
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    const response = ROUTES.includes(route)
      ? await handle(route, request, deps)
      : new Response('{"error":"not_found"}', { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(port);
  return { server, pool, deps };
}

if (process.argv[1]?.endsWith('local-backend.ts')) {
  const port = Number(process.env.PORT ?? 8787);
  const pin = process.env.ADMIN_PIN ?? '123456';
  startLocalBackend(port, pin);
  console.log(`PRISM local backend on http://localhost:${port}  (admin PIN ${pin}, db ${LOCAL_DB})`);
}
