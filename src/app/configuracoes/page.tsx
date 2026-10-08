'use client';

import { FormEvent, useEffect, useState } from 'react';
import { History, Pencil, Plus, Save, ShieldCheck, Trash2, UserCog, X } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';
type Municipality = { id: string; name: string; cnpj: string | null; city: string | null; state: string | null; active: boolean; created_at: string; };

type Driver = {
  id: string;
  municipality_id: string | null;
  profile_id: string | null;
  name: string;
  cpf: string | null;
  phone: string | null;
  active: boolean;
};

type Profile = {
  id: string;
  municipality_id: string | null;
  name: string;
  cpf: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  created_at: string;
};

const roleLabels: Record<Role, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  MOTORISTA: 'Motorista',
};

const roleDescriptions: Record<Role, string> = {
  ADMIN: 'Acesso administrativo e gestão de usuários.',
  GESTOR: 'Gestão operacional e acompanhamento.',
  OPERADOR: 'Cadastro, solicitações e agenda.',
  MOTORISTA: 'Operação das viagens e registros.',
};

export default function ConfiguracoesPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [municipalityEditing, setMunicipalityEditing] = useState<Municipality | null>(null);
  const [municipalityModalOpen, setMunicipalityModalOpen] = useState(false);
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<string | null>(null);
  const [municipalityName, setMunicipalityName] = useState('');
  const [municipalityCnpj, setMunicipalityCnpj] = useState('');
  const [municipalityCity, setMunicipalityCity] = useState('');
  const [municipalityState, setMunicipalityState] = useState('');
  const [municipalityActive, setMunicipalityActive] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userMunicipalityId, setUserMunicipalityId] = useState('');
  const [userName, setUserName] = useState('');
  const [userCpf, setUserCpf] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<Role>('OPERADOR');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('OPERADOR');
  const [municipalityId, setMunicipalityId] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isAdmin = currentProfile?.role === 'ADMIN';
  const canCreateUsers = currentProfile?.role === 'ADMIN' || currentProfile?.role === 'GESTOR';
  const availableMunicipalities = isAdmin
    ? municipalities
    : currentProfile?.municipality_id
      ? [{ id: currentProfile.municipality_id, name: 'Minha prefeitura', cnpj: null, city: null, state: null, active: true, created_at: '' } as Municipality]
      : [];

  async function loadData() {
    setLoading(true);
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = String(claimsData?.claims?.sub ?? '');
    setCurrentUserId(userId);

    const profileResult = await supabase.from('profiles')
      .select('id,municipality_id,name,cpf,phone,role,active,created_at')
      .order('name');

    if (profileResult.error) {
      setMessage(`Não foi possível carregar usuários: ${profileResult.error.message}`);
      setLoading(false);
      return;
    }

    const rows = (profileResult.data ?? []) as Profile[];
    const me = rows.find((row) => row.id === userId) ?? null;
    setProfiles(rows);
    setCurrentProfile(me);
    if (me?.role === 'ADMIN') {
      const [municipalityResult, driverResult] = await Promise.all([
        supabase.from('municipalities').select('id,name,cnpj,city,state,active,created_at').order('name'),
        supabase.from('drivers').select('id,municipality_id,profile_id,name,cpf,phone,active').order('name'),
      ]);
      if (!municipalityResult.error) setMunicipalities((municipalityResult.data ?? []) as Municipality[]);
      if (!driverResult.error) setDrivers((driverResult.data ?? []) as Driver[]);
    } else {
      setMunicipalities([]);
      setDrivers([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function openMunicipality(municipality?: Municipality) {
    setMunicipalityEditing(municipality ?? null);
    setMunicipalityModalOpen(true);
    setMunicipalityName(municipality?.name ?? '');
    setMunicipalityCnpj(municipality?.cnpj ?? '');
    setMunicipalityCity(municipality?.city ?? '');
    setMunicipalityState(municipality?.state ?? '');
    setMunicipalityActive(municipality?.active ?? true);
    setMessage('');
  }

  async function saveMunicipality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !municipalityName.trim()) return;
    setSaving(true); setMessage('');
    const payload = { name: municipalityName.trim(), cnpj: municipalityCnpj.trim() || null, city: municipalityCity.trim() || null, state: municipalityState.trim().toUpperCase() || null, active: municipalityActive };
    const result = municipalityEditing
      ? await supabase.from('municipalities').update(payload).eq('id', municipalityEditing.id)
      : await supabase.from('municipalities').insert(payload);
    if (result.error) setMessage(`Não foi possível salvar a prefeitura: ${result.error.message}`);
    else { setMessage(municipalityEditing ? 'Prefeitura atualizada com sucesso.' : 'Prefeitura cadastrada com sucesso.'); setMunicipalityEditing(null); setMunicipalityModalOpen(false); await loadData(); }
    setSaving(false);
  }

  function openUserModal(municipalityId: string) {
    setUserMunicipalityId(municipalityId);
    setUserName('');
    setUserCpf('');
    setUserPhone('');
    setUserEmail('');
    setUserPassword('');
    setUserRole('OPERADOR');
    setUserModalOpen(true);
    setMessage('');
  }

  function closeUserModal() {
    setUserModalOpen(false);
    setMessage('');
  }

  async function saveNewUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userMunicipalityId) return;
    setSaving(true);
    setMessage('');

    const response = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        municipalityId: userMunicipalityId,
        name: userName,
        cpf: userCpf,
        phone: userPhone,
        email: userEmail,
        password: userPassword,
        role: userRole,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível cadastrar o usuário.');
    } else {
      setMessage('Usuário cadastrado com sucesso.');
      setUserModalOpen(false);
      setSelectedMunicipalityId(userMunicipalityId);
      await loadData();
    }
    setSaving(false);
  }

  async function resetPassword(profile: Profile) {
    const password = window.prompt('Digite uma senha temporária com no mínimo 8 caracteres para ' + profile.name + ':');
    if (!password) return;
    if (password.length < 8) { setMessage('A senha temporária deve ter pelo menos 8 caracteres.'); return; }
    setSaving(true); setMessage('');
    const response = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset_password', userId: profile.id, password }) });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Senha temporária definida. O usuário deverá trocá-la no próximo acesso.' : (result.error ?? 'Não foi possível redefinir a senha.'));
    setSaving(false);
  }

  async function deleteUser(profile: Profile) {
    if (profile.id === currentUserId) {
      setMessage('Você não pode excluir seu próprio usuário.');
      return;
    }
    if (!window.confirm('Excluir o usuário ' + profile.name + '? Esta ação remove o acesso ao sistema.')) return;

    setSaving(true);
    setMessage('');
    const response = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userId: profile.id }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) setMessage(result.error ?? 'Não foi possível excluir o usuário.');
    else {
      setMessage('Usuário excluído com sucesso.');
      await loadData();
    }
    setSaving(false);
  }

  function openEdit(profile: Profile) {
    setEditing(profile);
    setName(profile.name);
    setCpf(profile.cpf ?? '');
    setPhone(profile.phone ?? '');
    setRole(profile.role);
    setMunicipalityId(profile.municipality_id ?? '');
    setActive(profile.active);
    setMessage('');
  }

  function closeEdit() {
    setEditing(null);
    setMessage('');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMessage('');

    const response = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', userId: editing.id, name, cpf, phone, role, municipalityId, active }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível salvar o usuário.');
    } else {
      setMessage('Usuário atualizado com sucesso.');
      setEditing(null);
      await loadData();
    }
    setSaving(false);
  }

  async function saveMyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentProfile) return;
    setSaving(true);
    setMessage('');

    const form = new FormData(event.currentTarget);
    const result = await supabase.from('profiles').update({
      name: String(form.get('name') ?? '').trim(),
      cpf: String(form.get('cpf') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
    }).eq('id', currentProfile.id);

    if (result.error) setMessage(`Não foi possível salvar seu perfil: ${result.error.message}`);
    else {
      setMessage('Seu perfil foi atualizado.');
      await loadData();
    }
    setSaving(false);
  }

  return (
    <main className="min-h-screen">
<section className="p-5 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><ShieldCheck size={16} /> Administração / Acessos</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Configurações</h1>
            <p className="text-sm text-slate-500">Perfil, permissões e usuários do sistema.</p>
            {(isAdmin || currentProfile?.role === 'GESTOR') && <Link href="/configuracoes/historico" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-50"><History size={16} /> Histórico administrativo</Link>}
          </div>

          {message && <div className="mb-5 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          {currentProfile && (
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><UserCog size={20} /></div>
                <div>
                  <h2 className="font-semibold text-slate-950">Meu perfil</h2>
                  <p className="text-xs text-slate-500">{roleLabels[currentProfile.role]} • acesso atual</p>
                </div>
              </div>
              <form onSubmit={saveMyProfile} className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">Nome<input name="name" defaultValue={currentProfile.name} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                <label className="text-sm">CPF<input name="cpf" defaultValue={currentProfile.cpf ?? ''} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                <label className="text-sm">Telefone<input name="phone" defaultValue={currentProfile.phone ?? ''} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                <div className="sm:col-span-3 flex justify-end">
                  <button disabled={saving} className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Save size={16} /> Salvar meu perfil</button>
                </div>
              </form>
            </section>
          )}

          {canCreateUsers && !isAdmin && currentProfile?.municipality_id && (
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold">Usuários da minha prefeitura</h2><p className="text-xs text-slate-500">Como gestor, você pode cadastrar operadores e motoristas na sua própria prefeitura.</p></div>
                <button onClick={() => openUserModal(currentProfile.municipality_id!)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16} /> Novo usuário</button>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold">Prefeituras / Municípios</h2><p className="text-xs text-slate-500">Cada prefeitura concentra seus usuários e sua operação.</p></div>
                <button onClick={() => openMunicipality()} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16} /> Nova prefeitura</button>
              </div>
              {municipalities.length === 0 ? <div className="p-6 text-sm text-slate-500">Nenhuma prefeitura cadastrada.</div> : <div className="divide-y">
                {municipalities.map((municipality) => {
                  const municipalityUsers = profiles.filter((profile) => profile.municipality_id === municipality.id);
                  const municipalityDrivers = drivers.filter((driver) => driver.municipality_id === municipality.id);
                  const isOpen = selectedMunicipalityId === municipality.id;
                  return (
                    <div key={municipality.id}>
                      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium text-slate-900">{municipality.name}</div>
                          <div className="text-xs text-slate-500">{municipality.city || 'Cidade não informada'}{municipality.state ? ` / ${municipality.state}` : ''}{municipality.cnpj ? ` • CNPJ ${municipality.cnpj}` : ''}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${municipality.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{municipality.active ? 'Ativa' : 'Inativa'}</span>
                          <button onClick={() => setSelectedMunicipalityId(isOpen ? null : municipality.id)} className="rounded-lg border px-3 py-2 text-sm font-medium">{isOpen ? 'Ocultar detalhes' : `Usuários (${municipalityUsers.length})`}</button>
                          <span className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-medium">Motoristas ({municipalityDrivers.length})</span>
                          <button onClick={() => openMunicipality(municipality)} className="rounded-lg border p-2" title="Editar prefeitura"><Pencil size={16} /></button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="border-t border-slate-200 bg-slate-50/70 p-4">
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div><h3 className="font-semibold text-slate-900">Usuários da prefeitura</h3><p className="text-xs text-slate-500">Gestores, operadores e motoristas vinculados a esta prefeitura.</p></div>
                            <button onClick={() => openUserModal(municipality.id)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16} /> Novo usuário</button>
                          </div>
                          {municipalityUsers.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Nenhum usuário vinculado. Edite um usuário existente para vinculá-lo a esta prefeitura.</div> : <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {municipalityUsers.map((profile) => (
                              <div key={profile.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                                <div><div className="font-medium text-slate-900">{profile.name}{profile.id === currentUserId ? ' (você)' : ''}</div><div className="text-xs text-slate-500">{profile.cpf || 'CPF não informado'}{profile.phone ? ` • ${profile.phone}` : ''}</div></div>
                                <div className="flex items-center gap-3">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{roleLabels[profile.role]}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${profile.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{profile.active ? 'Ativo' : 'Inativo'}</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => openEdit(profile)} className="rounded-lg border border-slate-200 p-2 text-teal-700 hover:bg-teal-50" title="Editar"><Pencil size={16} /></button>
                                    {isAdmin && profile.id !== currentUserId && <button onClick={() => resetPassword(profile)} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50" title="Redefinir senha">Redefinir senha</button>}
                                    {profile.role !== 'ADMIN' && profile.id !== currentUserId && <button onClick={() => deleteUser(profile)} disabled={saving} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50" title="Excluir usuário"><Trash2 size={16} /></button>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>}

                          <div className="mt-4">
                            <div className="mb-3">
                              <h3 className="font-semibold text-slate-900">Motoristas da prefeitura</h3>
                              <p className="text-xs text-slate-500">Todo motorista cadastrado na operação desta prefeitura aparece aqui automaticamente, inclusive quando o cadastro foi feito pelo gestor.</p>
                            </div>
                            {municipalityDrivers.length === 0 ? (
                              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Nenhum motorista cadastrado nesta prefeitura.</div>
                            ) : (
                              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                {municipalityDrivers.map((driver) => (
                                  <div key={driver.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <div className="font-medium text-slate-900">{driver.name}</div>
                                      <div className="text-xs text-slate-500">{driver.cpf || 'CPF não informado'}{driver.phone ? ` • ${driver.phone}` : ''}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${driver.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{driver.active ? 'Ativo' : 'Inativo'}</span>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${driver.profile_id ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{driver.profile_id ? 'Acesso vinculado' : 'Sem acesso'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={20} />
              <div className="text-sm text-amber-900">
                <div className="font-semibold">Criação de acesso</div>
                <p className="mt-1">O cadastro de usuários é feito dentro de cada prefeitura. A conta de acesso é criada com segurança e a senha inicial deve ser trocada no primeiro acesso.</p>
              </div>
            </div>
          </section>

          {isAdmin && municipalityModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
              <form onSubmit={saveMunicipality} className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{municipalityEditing ? 'Editar prefeitura' : 'Nova prefeitura'}</h2><p className="text-xs text-slate-500">Dados básicos da prefeitura.</p></div><button type="button" onClick={() => { setMunicipalityEditing(null); setMunicipalityModalOpen(false); }}><X size={20} /></button></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">Nome da prefeitura<input value={municipalityName} onChange={(e) => setMunicipalityName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" placeholder="Prefeitura Municipal de ..." /></label>
                  <label className="text-sm">CNPJ<input value={municipalityCnpj} onChange={(e) => setMunicipalityCnpj(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">Cidade<input value={municipalityCity} onChange={(e) => setMunicipalityCity(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">UF<input maxLength={2} value={municipalityState} onChange={(e) => setMunicipalityState(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 uppercase focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">Status<select value={municipalityActive ? 'true' : 'false'} onChange={(e) => setMunicipalityActive(e.target.value === 'true')} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
                </div>
                <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => { setMunicipalityEditing(null); setMunicipalityModalOpen(false); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar prefeitura'}</button></div>
              </form>
            </div>
          )}

          {canCreateUsers && userModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
              <form onSubmit={saveNewUser} className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div><h2 className="text-lg font-semibold">Novo usuário</h2><p className="text-xs text-slate-500">{municipalities.find((m) => m.id === userMunicipalityId)?.name ?? (userMunicipalityId === currentProfile?.municipality_id ? currentProfile?.name?.includes('') ? 'Minha prefeitura' : 'Minha prefeitura' : '')}</p></div>
                  <button type="button" onClick={closeUserModal}><X size={20} /></button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">Nome<input value={userName} onChange={(e) => setUserName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">CPF<input value={userCpf} onChange={(e) => setUserCpf(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">Telefone<input value={userPhone} onChange={(e) => setUserPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm sm:col-span-2">E-mail de acesso<input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" placeholder="usuario@prefeitura.gov.br" /></label>
                  <label className="text-sm">Perfil<select value={userRole} onChange={(e) => setUserRole(e.target.value as Role)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100">{isAdmin && <option value="GESTOR">Gestor</option>}<option value="OPERADOR">Operador</option><option value="MOTORISTA">Motorista</option></select></label>
                  <label className="text-sm">Senha inicial<input type="password" minLength={8} value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" placeholder="Mínimo 8 caracteres" /></label>
                </div>
                <p className="mt-4 text-xs text-slate-500">A conta será criada com e-mail confirmado e a senha inicial deverá ser trocada no primeiro acesso.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={closeUserModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                  <button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Cadastrando...' : 'Cadastrar usuário'}</button>
                </div>
              </form>
            </div>
          )}

          {editing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
              <form onSubmit={saveProfile} className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Editar usuário</h2>
                    <p className="text-xs text-slate-500">{editing.name}</p>
                  </div>
                  <button type="button" onClick={closeEdit}><X size={20} /></button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">Nome<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">CPF<input value={cpf} onChange={(e) => setCpf(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">Telefone<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" /></label>
                  <label className="text-sm">Perfil<select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!isAdmin} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100">
                    {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select><span className="mt-1 block text-xs text-slate-500">{roleDescriptions[role]}</span></label>
                  <label className="text-sm">Prefeitura<select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} disabled={!isAdmin || role === 'ADMIN'} required={role !== 'ADMIN'} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"><option value="">Selecione a prefeitura</option>{municipalities.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Gestores e operadores devem pertencer a uma prefeitura.</span></label>
                  <label className="text-sm">Status<select value={active ? 'true' : 'false'} onChange={(e) => setActive(e.target.value === 'true')} disabled={!isAdmin} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100">
                    <option value="true">Ativo</option><option value="false">Inativo</option>
                  </select></label>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={closeEdit} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                  <button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar alterações'}</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
