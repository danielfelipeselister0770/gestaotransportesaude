import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const { supabase, user } = await (async () => {
    const client = createServerClient();
    const { data: claimsData } = await client.auth.getClaims();
    const userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) return { supabase: client, user: null };
    const { data: profile } = await client.from('profiles').select('id,name,role,municipality_id').eq('id', userId).maybeSingle();
    return { supabase: client, user: profile };
  })();

  if (!user || !['ADMIN', 'GESTOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { driverId?: string; email?: string } | null;
  const driverId = body?.driverId?.trim();
  const email = body?.email?.trim().toLowerCase();
  if (!driverId || !email) return NextResponse.json({ error: 'Motorista e e-mail são obrigatórios.' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: driver, error: driverError } = await admin.from('drivers').select('id,name,municipality_id,profile_id').eq('id', driverId).maybeSingle();
  if (driverError || !driver) return NextResponse.json({ error: 'Motorista não encontrado.' }, { status: 404 });
  if (user.role !== 'ADMIN' && driver.municipality_id !== user.municipality_id) return NextResponse.json({ error: 'Motorista fora da sua prefeitura.' }, { status: 403 });
  if (driver.profile_id) return NextResponse.json({ error: 'Este motorista já possui uma conta vinculada.' }, { status: 409 });

  const redirectTo = `${new URL(request.url).origin}/auth/callback`;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError || !invited.user) return NextResponse.json({ error: inviteError?.message ?? 'Não foi possível enviar o convite.' }, { status: 400 });

  const { error: profileError } = await admin.from('profiles').upsert({
    id: invited.user.id,
    name: driver.name,
    role: 'MOTORISTA',
    active: true,
    municipality_id: driver.municipality_id,
  });
  if (profileError) return NextResponse.json({ error: `Convite enviado, mas não foi possível criar o perfil: ${profileError.message}` }, { status: 500 });

  const { error: linkError } = await admin.from('drivers').update({ profile_id: invited.user.id, manager_id: user.role === 'GESTOR' ? user.id : null }).eq('id', driver.id);
  if (linkError) return NextResponse.json({ error: `Perfil criado, mas não foi possível vincular o motorista: ${linkError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, message: 'Convite enviado e motorista vinculado.' });
}
