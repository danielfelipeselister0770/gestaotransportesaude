import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Configuração segura do servidor ausente.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getCurrentProfile() {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return null;

  const { data: profile } = await server
    .from('profiles')
    .select('id,role,municipality_id,active,must_change_password')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || !profile.active || profile.must_change_password || !['ADMIN', 'GESTOR'].includes(profile.role)) return null;
  return profile;
}

export async function POST(request: Request) {
  const currentProfile = await getCurrentProfile();
  if (!currentProfile) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    action?: 'create' | 'delete' | 'update' | 'reset_password';
    userId?: string;
    municipalityId?: string;
    name?: string;
    cpf?: string;
    phone?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    active?: boolean;
  } | null;

  const action = body?.action ?? 'create';
  const admin = adminClient();
  const recordHistory = async (targetUserId: string, municipalityId: string | null, historyAction: string, details: Record<string, unknown> = {}) => {
    await admin.from('user_admin_history').insert({ target_user_id: targetUserId, municipality_id: municipalityId, actor_user_id: currentProfile.id, action: historyAction, details });
  };

  if (action === 'delete') {
    const userId = body?.userId?.trim();
    if (!userId) return NextResponse.json({ error: 'Usuário é obrigatório.' }, { status: 400 });
    if (userId === currentProfile.id) return NextResponse.json({ error: 'Você não pode excluir seu próprio usuário.' }, { status: 400 });

    const { data: target } = await admin
      .from('profiles')
      .select('id,role,municipality_id,name')
      .eq('id', userId)
      .maybeSingle();

    if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (currentProfile.role === 'GESTOR' && target.municipality_id !== currentProfile.municipality_id) return NextResponse.json({ error: 'O gestor só pode excluir usuários da própria prefeitura.' }, { status: 403 });
    if (target.role === 'ADMIN') return NextResponse.json({ error: 'Usuários ADMIN não podem ser excluídos por esta tela.' }, { status: 400 });

    // Desvincula relações operacionais antes de remover a conta Auth.
    await recordHistory(userId, target.municipality_id, 'DELETE', { name: target.name, role: target.role });
    await admin.from('drivers').update({ profile_id: null, manager_id: null }).or(`profile_id.eq.${userId},manager_id.eq.${userId}`);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: 'Não foi possível excluir o usuário: ' + error.message }, { status: 400 });

    return NextResponse.json({ ok: true, message: 'Usuário excluído com sucesso.' });
  }

  if (action === 'reset_password') {
    const userId = body?.userId?.trim();
    const password = body?.password ?? '';
    if (!userId || password.length < 8) return NextResponse.json({ error: 'Usuário e senha temporária de no mínimo 8 caracteres são obrigatórios.' }, { status: 400 });
    if (currentProfile.role !== 'ADMIN') return NextResponse.json({ error: 'Apenas o administrador pode redefinir senhas.' }, { status: 403 });
    const { data: target } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { password });
    if (authError) return NextResponse.json({ error: 'Não foi possível redefinir a senha: ' + authError.message }, { status: 400 });
    const { error: profileError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
    if (profileError) return NextResponse.json({ error: 'Senha redefinida, mas não foi possível exigir a troca no próximo acesso.' }, { status: 500 });
    await recordHistory(userId, null, 'RESET_PASSWORD');
    return NextResponse.json({ ok: true, message: 'Senha temporária definida. O usuário deverá trocá-la no próximo acesso.' });
  }

  if (action === 'update') {
    const userId = body?.userId?.trim();
    if (!userId) return NextResponse.json({ error: 'Usuário é obrigatório.' }, { status: 400 });
    const { data: target } = await admin.from('profiles').select('id,role,municipality_id').eq('id', userId).maybeSingle();
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (currentProfile.role !== 'ADMIN') return NextResponse.json({ error: 'Apenas o administrador pode alterar perfil, prefeitura ou status de acesso.' }, { status: 403 });
    const nextRole = body?.role;
    if (!nextRole || !['ADMIN','GESTOR','OPERADOR','MOTORISTA'].includes(nextRole)) return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 });
    const nextMunicipality = nextRole === 'ADMIN' ? null : body?.municipalityId?.trim();
    if (nextRole !== 'ADMIN' && !nextMunicipality) return NextResponse.json({ error: 'Prefeitura é obrigatória.' }, { status: 400 });
    const { error } = await admin.from('profiles').update({
      name: body?.name?.trim(),
      cpf: body?.cpf?.trim() || null,
      phone: body?.phone?.trim() || null,
      role: nextRole,
      municipality_id: nextMunicipality,
      active: body?.active !== false,
    }).eq('id', userId);
    if (error) return NextResponse.json({ error: 'Não foi possível atualizar o usuário: ' + error.message }, { status: 400 });
    await recordHistory(userId, nextMunicipality ?? null, 'UPDATE', { role: nextRole, active: body?.active !== false });
    return NextResponse.json({ ok: true, message: 'Usuário atualizado com segurança.' });
  }

  if (action !== 'create') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? '';
  const municipalityId = body?.municipalityId?.trim();
  const role = body?.role;

  if (!name || !email || !password || !municipalityId || !role) {
    return NextResponse.json({ error: 'Preencha nome, e-mail, senha, prefeitura e perfil.' }, { status: 400 });
  }
  if (!['GESTOR', 'OPERADOR', 'MOTORISTA'].includes(role)) {
    return NextResponse.json({ error: 'Perfil de usuário inválido.' }, { status: 400 });
  }
  if (currentProfile.role === 'GESTOR') {
    if (role === 'GESTOR') return NextResponse.json({ error: 'O gestor não pode cadastrar outro gestor.' }, { status: 403 });
    if (municipalityId !== currentProfile.municipality_id) return NextResponse.json({ error: 'O gestor só pode cadastrar usuários na própria prefeitura.' }, { status: 403 });
  }
  if (password.length < 8) return NextResponse.json({ error: 'A senha inicial deve ter pelo menos 8 caracteres.' }, { status: 400 });

  const { data: municipality } = await admin
    .from('municipalities')
    .select('id')
    .eq('id', municipalityId)
    .maybeSingle();
  if (!municipality) return NextResponse.json({ error: 'Prefeitura não encontrada.' }, { status: 404 });

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Não foi possível criar a conta.' }, { status: 400 });
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: authData.user.id,
    municipality_id: municipalityId,
    name,
    cpf: body?.cpf?.trim() || null,
    phone: body?.phone?.trim() || null,
    role,
    active: true,
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: 'A conta foi criada, mas não foi possível criar o perfil: ' + profileError.message }, { status: 500 });
  }

  if (role === 'MOTORISTA') {
    const { data: existingDriver } = await admin.from('drivers').select('id').eq('profile_id', authData.user.id).maybeSingle();
    if (!existingDriver) {
      const { error: driverError } = await admin.from('drivers').insert({
        profile_id: authData.user.id,
        name,
        cpf: body?.cpf?.trim() || null,
        phone: body?.phone?.trim() || null,
        municipality_id: municipalityId,
      });
      if (driverError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: 'Não foi possível criar o cadastro do motorista: ' + driverError.message }, { status: 500 });
      }
    }
  }

  await recordHistory(authData.user.id, municipalityId, 'CREATE', { role, name });

  return NextResponse.json({
    ok: true,
    user: { id: authData.user.id, name, email, role, municipalityId },
    message: 'Usuário cadastrado com sucesso.',
  });
}
