// Deno-only glue: wires the shared router to Supabase. Not used by the local Node harness.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, type Deps } from './router.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const deps: Deps = {
  adminPin: Deno.env.get('ADMIN_PIN') ?? '',
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  async rpc(fn, args) {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  },
};

export function serve(route: string): void {
  Deno.serve((req: Request) => handle(route, req, deps));
}
