import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const actorId = claimsData?.claims?.sub as string | undefined;
  if (!actorId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: actor } = await server.from('profiles')
    .select('id,role,municipality_id,active,must_change_password')
    .eq('id', actorId).maybeSingle();
  if (!actor?.active || actor.must_change_password || !['ADMIN', 'GESTOR'].includes(actor.role)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { userId?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) {
    return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 });
  }
  if (userId === actorId) {
    return NextResponse.json({ error: 'Não é permitido gerar um código para sua própria conta.' }, { status: 403 });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: target, error: targetError } = await admin.from('profiles')
    .select('id,role,municipality_id,active').eq('id', userId).maybeSingle();
  if (targetError || !target || !target.active) {
    return NextResponse.json({ error: 'Usuário não encontrado ou inativo.' }, { status: 404 });
  }
  if (target.role === 'ADMIN' ||
      (actor.role === 'GESTOR' && (
        actor.municipality_id !== target.municipality_id ||
        !['GESTOR', 'OPERADOR', 'MOTORISTA'].includes(target.role)
      ))) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 });
  }

  const code = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error: insertError } = await admin.from('password_recovery_requests').insert({
    target_user_id: userId,
    requested_by: actorId,
    municipality_id: target.municipality_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertError) {
    console.error('Falha ao criar código de recuperação:', insertError.code);
    return NextResponse.json({ error: 'Não foi possível gerar o código.' }, { status: 500 });
  }

  await admin.from('user_admin_history').insert({
    target_user_id: userId,
    municipality_id: target.municipality_id,
    actor_user_id: actorId,
    action: 'RECOVERY_CODE_CREATED',
    details: { expires_at: expiresAt },
  });

  return NextResponse.json({ code, expiresAt, message: 'Entregue o código somente após confirmar a identidade do usuário.' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
