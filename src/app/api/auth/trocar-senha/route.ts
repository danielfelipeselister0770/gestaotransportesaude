import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Configuração segura do servidor ausente.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { password?: string } | null;
  const password = body?.password ?? '';
  if (password.length < 8) return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('id,active,must_change_password,municipality_id').eq('id', userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  if (!profile.active) return NextResponse.json({ error: 'Usuário inativo. Procure o administrador.' }, { status: 403 });
  if (!profile.must_change_password) return NextResponse.json({ error: 'Não há troca obrigatória de senha pendente.' }, { status: 400 });

  const { error: authError } = await admin.auth.admin.updateUserById(userId, { password });
  if (authError) return NextResponse.json({ error: 'Não foi possível alterar a senha: ' + authError.message }, { status: 400 });

  const { data: updatedProfile, error: profileError } = await admin.rpc('complete_initial_password_change', { p_user_id: userId });
  if (profileError || !updatedProfile) {
    console.error('Falha ao concluir troca obrigatória de senha no perfil:', { code: profileError?.code, message: profileError?.message, details: profileError?.details, hint: profileError?.hint });
    return NextResponse.json({ error: 'Senha alterada, mas o acesso ainda não foi liberado.', errorCode: profileError?.code ?? 'PROFILE_UPDATE_FAILED' }, { status: 500 });
  }

  await admin.from('user_admin_history').insert({
    target_user_id: userId,
    municipality_id: profile.municipality_id,
    actor_user_id: userId,
    action: 'INITIAL_PASSWORD_CHANGED',
    details: {},
  });

  return NextResponse.json({ ok: true });
}
