import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { code?: unknown; password?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!/^[a-f0-9]{48}$/.test(code) || password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: 'Código inválido ou senha fora dos requisitos (12 a 128 caracteres).' }, { status: 400 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tokenHash = createHash('sha256').update(code).digest('hex');
  const { data: redeemed, error: redeemError } = await admin.rpc('consume_password_recovery_code', {
    p_token_hash: tokenHash,
  });
  const recovery = redeemed?.[0];
  if (redeemError) {
    console.error('Falha ao consumir código de recuperação:', redeemError.code);
    return NextResponse.json({ error: 'Não foi possível validar o código.' }, { status: 500 });
  }
  if (!recovery) return NextResponse.json({ error: 'Código inválido, expirado ou já utilizado.' }, { status: 400 });

  const { data: target } = await admin.from('profiles')
    .select('active,municipality_id').eq('id', recovery.target_user_id).maybeSingle();
  if (!target?.active || target.municipality_id !== recovery.municipality_id) {
    return NextResponse.json({ error: 'Acesso não autorizado. Solicite um novo código.' }, { status: 403 });
  }
  const { error: passwordError } = await admin.auth.admin.updateUserById(recovery.target_user_id, { password });
  if (passwordError) {
    console.error('Falha ao redefinir senha por código:', passwordError.code);
    return NextResponse.json({ error: 'Não foi possível atualizar a senha. Solicite outro código.' }, { status: 500 });
  }
  const { error: historyError } = await admin.from('user_admin_history').insert({
    target_user_id: recovery.target_user_id,
    municipality_id: recovery.municipality_id,
    actor_user_id: recovery.requested_by,
    action: 'RECOVERY_CODE_REDEEMED',
    details: { method: 'one_time_code' },
  });
  if (historyError) console.error('Falha ao registrar auditoria de recuperação:', historyError.code);
  return NextResponse.json({ ok: true, message: 'Senha atualizada. Entre com sua nova senha.' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
