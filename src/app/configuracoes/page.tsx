'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Pencil, Plus, Save, ShieldCheck, UserCog, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';
type Municipality = { id: string; name: string; cnpj: string | null; city: string | null; state: string | null; active: boolean; created_at: string; };

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
      const municipalityResult = await supabase.from('municipalities').select('id,name,cnpj,city,state,active,created_at').order('name');
      if (!municipalityResult.error) setMunicipalities((municipalityResult.data ?? []) as Municipality[]);
    } else {
      setMunicipalities([]);
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

    const result = await supabase.from('profiles').update({
      name: name.trim(),
      cpf: cpf.trim() || null,
      phone: phone.trim() || null,
      role,
      municipality_id: role === 'ADMIN' ? null : (municipalityId || null),
      active,
    }).eq('id', editing.id);

    if (result.error) {
      setMessage(`Não foi possível salvar: ${result.error.message}`);
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
    <main className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {[
            ['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],
            ['Veículos','/veiculos'],['Motoristas','/motoristas'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],
            ['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes']
          ].map(([label, href]) => (
            <Link key={label} href={href} className={`block rounded-lg px-3 py-2 ${label === 'Configurações' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="md:ml-64 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
            <p className="text-sm text-slate-500">Perfil, permissões e usuários do sistema.</p>
          </div>

          {message && <div className="mb-5 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          {currentProfile && (
            <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2"><UserCog size={20} /></div>
                <div>
                  <h2 className="font-semibold">Meu perfil</h2>
                  <p className="text-xs text-slate-500">{roleLabels[currentProfile.role]} • acesso atual</p>
                </div>
              </div>
              <form onSubmit={saveMyProfile} className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">Nome<input name="name" defaultValue={currentProfile.name} required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">CPF<input name="cpf" defaultValue={currentProfile.cpf ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Telefone<input name="phone" defaultValue={currentProfile.phone ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <div className="sm:col-span-3 flex justify-end">
                  <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Save size={16} /> Salvar meu perfil</button>
                </div>
              </form>
            </section>
          )}

          {isAdmin && (
            <section className="mb-6 rounded-xl border bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold">Prefeituras / Municípios</h2><p className="text-xs text-slate-500">Cada prefeitura concentra seus usuários e sua operação.</p></div>
                <button onClick={() => openMunicipality()} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Plus size={16} /> Nova prefeitura</button>
              </div>
              {municipalities.length === 0 ? <div className="p-6 text-sm text-slate-500">Nenhuma prefeitura cadastrada.</div> : <div className="divide-y">
                {municipalities.map((municipality) => {
                  const municipalityUsers = profiles.filter((profile) => profile.municipality_id === municipality.id);
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
                          <button onClick={() => setSelectedMunicipalityId(isOpen ? null : municipality.id)} className="rounded-lg border px-3 py-2 text-sm font-medium">{isOpen ? 'Ocultar usuários' : `Usuários (${municipalityUsers.length})`}</button>
                          <button onClick={() => openMunicipality(municipality)} className="rounded-lg border p-2" title="Editar prefeitura"><Pencil size={16} /></button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="border-t bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div><h3 className="font-semibold text-slate-900">Usuários da prefeitura</h3><p className="text-xs text-slate-500">Gestores, operadores e motoristas vinculados a esta prefeitura.</p></div>
                          </div>
                          {municipalityUsers.length === 0 ? <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">Nenhum usuário vinculado. Edite um usuário existente para vinculá-lo a esta prefeitura.</div> : <div className="divide-y rounded-lg border bg-white">
                            {municipalityUsers.map((profile) => (
                              <div key={profile.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                                <div><div className="font-medium text-slate-900">{profile.name}{profile.id === currentUserId ? ' (você)' : ''}</div><div className="text-xs text-slate-500">{profile.cpf || 'CPF não informado'}{profile.phone ? ` • ${profile.phone}` : ''}</div></div>
                                <div className="flex items-center gap-3">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{roleLabels[profile.role]}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${profile.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{profile.active ? 'Ativo' : 'Inativo'}</span>
                                  <button onClick={() => openEdit(profile)} className="rounded-lg border p-2" title="Editar"><Pencil size={16} /></button>
                                </div>
                              </div>
                            ))}
                          </div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
            </section>
          )}

          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={20} />
              <div className="text-sm text-amber-900">
                <div className="font-semibold">Criação de acesso</div>
                <p className="mt-1">A criação de login e senha acontece no Supabase Auth. Esta tela administra o perfil e as permissões depois que o acesso autenticado existir.</p>
              </div>
            </div>
          </section>

          {isAdmin && municipalityModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <form onSubmit={saveMunicipality} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{municipalityEditing ? 'Editar prefeitura' : 'Nova prefeitura'}</h2><p className="text-xs text-slate-500">Dados básicos da prefeitura.</p></div><button type="button" onClick={() => { setMunicipalityEditing(null); setMunicipalityModalOpen(false); }}><X size={20} /></button></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">Nome da prefeitura<input value={municipalityName} onChange={(e) => setMunicipalityName(e.target.value)} required className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Prefeitura Municipal de ..." /></label>
                  <label className="text-sm">CNPJ<input value={municipalityCnpj} onChange={(e) => setMunicipalityCnpj(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm">Cidade<input value={municipalityCity} onChange={(e) => setMunicipalityCity(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm">UF<input maxLength={2} value={municipalityState} onChange={(e) => setMunicipalityState(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" /></label>
                  <label className="text-sm">Status<select value={municipalityActive ? 'true' : 'false'} onChange={(e) => setMunicipalityActive(e.target.value === 'true')} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
                </div>
                <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => { setMunicipalityEditing(null); setMunicipalityModalOpen(false); }} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar prefeitura'}</button></div>
              </form>
            </div>
          )}

          {editing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <form onSubmit={saveProfile} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Editar usuário</h2>
                    <p className="text-xs text-slate-500">{editing.name}</p>
                  </div>
                  <button type="button" onClick={closeEdit}><X size={20} /></button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">Nome<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm">CPF<input value={cpf} onChange={(e) => setCpf(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm">Telefone<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm">Perfil<select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!isAdmin} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100">
                    {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select><span className="mt-1 block text-xs text-slate-500">{roleDescriptions[role]}</span></label>
                  <label className="text-sm">Prefeitura<select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} disabled={!isAdmin || role === 'ADMIN'} required={role !== 'ADMIN'} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"><option value="">Selecione a prefeitura</option>{municipalities.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Gestores e operadores devem pertencer a uma prefeitura.</span></label>
                  <label className="text-sm">Status<select value={active ? 'true' : 'false'} onChange={(e) => setActive(e.target.value === 'true')} disabled={!isAdmin} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100">
                    <option value="true">Ativo</option><option value="false">Inativo</option>
                  </select></label>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={closeEdit} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                  <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar alterações'}</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
