import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function hashTemporaryPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

function createTemporaryPassword() {
  return randomBytes(9).toString('base64url').replace(/[-_]/g, 'A');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    action?: 'generate' | 'validate' | 'activate' | 'complete';
    driverId?: string;
    email?: string;
    token?: string;
    temporaryPassword?: string;
    password?: string;
  } | null;

  const action = body?.action ?? 'generate';

  if (action === 'activate') {
    const token = body?.token?.trim();
    const temporaryPassword = body?.temporaryPassword ?? '';
    const password = body?.password ?? '';
    if (!token || !temporaryPassword || !password) return NextResponse.json({ error: 'Dados de primeiro acesso incompletos.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'A senha definitiva deve ter pelo menos 8 caracteres.' }, { status: 400 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: driver } = await admin.from('drivers')
      .select('id,profile_id,temporary_password_hash,access_token_expires_at,access_token_used_at')
      .eq('access_token_hash', hashToken(token))
      .maybeSingle();

    if (!driver || !driver.profile_id || driver.access_token_used_at || !driver.access_token_expires_at || new Date(driver.access_token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Este link de acesso é inválido, expirou ou já foi utilizado.' }, { status: 410 });
    }

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(driver.profile_id);
    const email = authUser.user?.email;
    if (userError || !email) return NextResponse.json({ error: 'Não foi possível localizar a conta do motorista.' }, { status: 404 });

    if (!driver.temporary_password_hash || hashTemporaryPassword(temporaryPassword) !== driver.temporary_password_hash) {
      return NextResponse.json({ error: 'Senha provisória incorreta.' }, { status: 401 });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(driver.profile_id, { password, email_confirm: true });
    if (updateError) return NextResponse.json({ error: 'Não foi possível definir a senha definitiva: ' + updateError.message }, { status: 400 });

    const { error: profileError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', driver.profile_id);
    if (profileError) return NextResponse.json({ error: 'Senha criada, mas não foi possível concluir a ativação: ' + profileError.message }, { status: 500 });

    const { error: tokenError } = await admin.from('drivers').update({ access_token_used_at: new Date().toISOString() }).eq('id', driver.id);
    if (tokenError) return NextResponse.json({ error: 'Senha criada, mas não foi possível concluir a ativação: ' + tokenError.message }, { status: 500 });

    return NextResponse.json({ ok: true, email });
  }

  if (action === 'validate') {
    const token = body?.token?.trim();
    if (!token) return NextResponse.json({ error: 'Link de acesso inválido.' }, { status: 400 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: driver } = await admin.from('drivers')
      .select('id,name,profile_id,access_token_expires_at,access_token_used_at')
      .eq('access_token_hash', hashToken(token))
      .maybeSingle();

    if (!driver || !driver.profile_id || driver.access_token_used_at || !driver.access_token_expires_at || new Date(driver.access_token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Este link de acesso é inválido, expirou ou já foi utilizado.' }, { status: 410 });
    }

    const { data: authUser, error } = await admin.auth.admin.getUserById(driver.profile_id);
    if (error || !authUser.user?.email) return NextResponse.json({ error: 'Não foi possível localizar a conta do motorista.' }, { status: 404 });

    return NextResponse.json({ ok: true, name: driver.name, email: authUser.user.email });
  }

  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  const { data: profile } = userId
    ? await server.from('profiles').select('id,name,role,municipality_id').eq('id', userId).maybeSingle()
    : { data: null };

  if (action === 'complete') {
    if (!userId || !profile || !['MOTORISTA', 'ADMIN', 'GESTOR'].includes(profile.role)) {
      return NextResponse.json({ error: 'Acesso não autenticado.' }, { status: 401 });
    }

    const token = body?.token?.trim();
    if (!token) return NextResponse.json({ error: 'Link de acesso inválido.' }, { status: 400 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: driver } = await admin.from('drivers')
      .select('id,profile_id,access_token_expires_at,access_token_used_at')
      .eq('access_token_hash', hashToken(token))
      .maybeSingle();

    if (!driver || driver.profile_id !== userId || driver.access_token_used_at || !driver.access_token_expires_at || new Date(driver.access_token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Este link de acesso é inválido, expirou ou já foi utilizado.' }, { status: 410 });
    }

    const { error: profileError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', userId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const { error: tokenError } = await admin.from('drivers').update({ access_token_used_at: new Date().toISOString() }).eq('id', driver.id);
    if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  if (!userId || !profile || !['ADMIN', 'GESTOR'].includes(profile.role)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const driverId = body?.driverId?.trim();
  const email = body?.email?.trim().toLowerCase();
  if (!driverId) return NextResponse.json({ error: 'Motorista é obrigatório.' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: driver, error: driverError } = await admin.from('drivers')
    .select('id,name,municipality_id,profile_id')
    .eq('id', driverId)
    .maybeSingle();

  if (driverError || !driver) return NextResponse.json({ error: 'Motorista não encontrado.' }, { status: 404 });
  if (profile.role !== 'ADMIN' && driver.municipality_id !== profile.municipality_id) {
    return NextResponse.json({ error: 'Motorista fora da sua prefeitura.' }, { status: 403 });
  }
  if (!driver.profile_id && !email) {
    return NextResponse.json({ error: 'Informe o e-mail que o motorista usará para entrar no sistema.' }, { status: 400 });
  }

  const temporaryPassword = createTemporaryPassword();
  let authUserId = driver.profile_id;

  if (driver.profile_id) {
    const { error } = await admin.auth.admin.updateUserById(driver.profile_id, {
      password: temporaryPassword,
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: 'Não foi possível gerar o acesso provisório: ' + error.message }, { status: 400 });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: email!,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Não foi possível criar a conta do motorista.' }, { status: 400 });
    authUserId = data.user.id;

    const { error: profileError } = await admin.from('profiles').upsert({
      id: authUserId,
      name: driver.name,
      role: 'MOTORISTA',
      active: true,
      municipality_id: driver.municipality_id,
      must_change_password: true,
    });
    if (profileError) return NextResponse.json({ error: 'Conta criada, mas não foi possível criar o perfil: ' + profileError.message }, { status: 500 });

    const { error: linkError } = await admin.from('drivers').update({
      profile_id: authUserId,
      manager_id: profile.role === 'GESTOR' ? userId : null,
    }).eq('id', driver.id);
    if (linkError) return NextResponse.json({ error: 'Conta criada, mas não foi possível vincular o motorista: ' + linkError.message }, { status: 500 });
  }

  await admin.from('profiles').update({ must_change_password: true }).eq('id', authUserId);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { error: tokenError } = await admin.from('drivers').update({
    access_token_hash: hashToken(token),
    temporary_password_hash: hashTemporaryPassword(temporaryPassword),
    access_token_expires_at: expiresAt.toISOString(),
    access_token_used_at: null,
  }).eq('id', driver.id);

  if (tokenError) return NextResponse.json({ error: 'Não foi possível gerar o link de acesso: ' + tokenError.message }, { status: 500 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://orange-rat-645078.hostingersite.com';
  const accessLink = origin + '/motorista/primeiro-acesso?token=' + encodeURIComponent(token);
  const { data: authUser } = await admin.auth.admin.getUserById(authUserId!);

  return NextResponse.json({
    ok: true,
    email: authUser.user?.email ?? email,
    temporaryPassword,
    accessLink,
    expiresAt: expiresAt.toISOString(),
    message: 'Acesso provisório gerado. Entregue ao motorista o link e a senha provisória.',
  });
}
