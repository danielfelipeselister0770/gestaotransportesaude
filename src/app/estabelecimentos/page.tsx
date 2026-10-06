'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Pencil, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';

type Establishment = {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  cnes: string | null;
  cnpj: string | null;
  management: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  active: boolean;
  is_secretariat: boolean;
  municipality_id: string | null;
};

type Municipality = { id: string; name: string; active: boolean };

const nav = [
  ['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],
  ['Veículos','/veiculos'],['Motoristas','/motoristas'],['Estabelecimentos de Saúde','/estabelecimentos'],
  ['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],['Ocorrências','/ocorrencias'],
  ['Relatórios','/relatorios'],['Configurações','/configuracoes']
];

export default function EstablishmentsPage() {
  const supabase = createClient();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [municipalityName, setMunicipalityName] = useState('');
  const [municipalityId, setMunicipalityId] = useState<string | null>(null);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Establishment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = String(claimsData?.claims?.sub ?? '');
    if (!userId) {
      setMessage('Sessão não encontrada.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,municipality_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      setMessage(profileError?.message ?? 'Não foi possível identificar o usuário.');
      setLoading(false);
      return;
    }

    setRole(profile.role as Role);
    setMunicipalityId(profile.municipality_id);

    if (profile.role === 'ADMIN') {
      const { data: municipalityRows } = await supabase.from('municipalities').select('id,name,active').eq('active', true).order('name');
      setMunicipalities((municipalityRows ?? []) as Municipality[]);
    }

    if (profile.municipality_id) {
      const { data: municipality } = await supabase
        .from('municipalities')
        .select('name')
        .eq('id', profile.municipality_id)
        .maybeSingle();
      setMunicipalityName(municipality?.name ?? 'Minha prefeitura');
    } else if (profile.role === 'ADMIN') {
      setMunicipalityName('Todas as prefeituras');
    }

    const result = await supabase
      .from('health_units')
      .select('id,name,type,subtype,cnes,cnpj,management,address,city,phone,active,is_secretariat,municipality_id')
      .order('name');

    if (result.error) setMessage('Erro ao carregar estabelecimentos: ' + result.error.message);
    else setEstablishments((result.data ?? []) as Establishment[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const canManage = role === 'ADMIN' || role === 'GESTOR';

  function openNew() {
    setEditing(null);
    setShowForm(true);
    setMessage('');
  }

  function openEdit(item: Establishment) {
    setEditing(item);
    setShowForm(true);
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    const form = new FormData(event.currentTarget);
    const cnes = String(form.get('cnes') ?? '').replace(/\D/g, '');
    const cnpj = String(form.get('cnpj') ?? '').replace(/\D/g, '');

    if (cnes && cnes.length !== 7) {
      setMessage('O CNES deve conter 7 dígitos.');
      return;
    }
    if (cnpj && cnpj.length !== 14) {
      setMessage('O CNPJ deve conter 14 dígitos.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload = {
      name: String(form.get('name') ?? '').trim(),
      type: String(form.get('type') ?? '').trim() || null,
      subtype: String(form.get('subtype') ?? '').trim() || null,
      cnes: cnes || null,
      cnpj: cnpj || null,
      management: String(form.get('management') ?? '').trim() || null,
      address: String(form.get('address') ?? '').trim() || null,
      city: String(form.get('city') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      active: form.get('active') === 'on',
      is_secretariat: form.get('is_secretariat') === 'on',
    };

    if (!payload.name) {
      setMessage('Informe o nome do estabelecimento.');
      setSaving(false);
      return;
    }

    const selectedMunicipalityId = role === 'ADMIN'
      ? String(form.get('municipality_id') ?? '') || null
      : municipalityId;

    if (!selectedMunicipalityId) {
      setMessage('Selecione a prefeitura do estabelecimento.');
      setSaving(false);
      return;
    }

    const result = editing
      ? await supabase.from('health_units').update({ ...payload, municipality_id: selectedMunicipalityId }).eq('id', editing.id)
      : await supabase.from('health_units').insert({ ...payload, municipality_id: selectedMunicipalityId });

    if (result.error) {
      setMessage('Não foi possível salvar: ' + result.error.message);
    } else {
      setShowForm(false);
      setEditing(null);
      setMessage(editing ? 'Estabelecimento atualizado com sucesso.' : 'Estabelecimento cadastrado com sucesso.');
      await loadData();
    }
    setSaving(false);
  }

  const filtered = establishments.filter((item) => {
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q)
      || (item.cnes ?? '').includes(q)
      || (item.cnpj ?? '').includes(q)
      || (item.city ?? '').toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {nav.map(([label, href]) => (
            <Link key={label} href={href} className={'block rounded-lg px-3 py-2 ' + (label === 'Estabelecimentos de Saúde' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50')}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="md:ml-64 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Estabelecimentos de Saúde</h1>
              <p className="text-sm text-slate-500">{municipalityName || 'Cadastro vinculado à prefeitura'}</p>
            </div>
            {canManage && (
              <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
                <Plus size={18} /> Novo estabelecimento
              </button>
            )}
          </div>

          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CNES, CNPJ ou cidade" className="w-full outline-none text-sm" />
          </div>

          {showForm && (
            <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{editing ? 'Editar estabelecimento' : 'Novo estabelecimento'}</h2>
                  <p className="text-xs text-slate-500">Identificação básica para a futura estrutura SUS/CNES.</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {role === 'ADMIN' && <label className="text-sm sm:col-span-2 lg:col-span-4">Prefeitura
                  <select name="municipality_id" required defaultValue={editing?.municipality_id ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2">
                    <option value="">Selecione a prefeitura</option>
                    {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>}
                <label className="text-sm sm:col-span-2 lg:col-span-3">Nome do estabelecimento
                  <input name="name" required defaultValue={editing?.name ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Secretaria Municipal de Saúde" />
                </label>
                <label className="text-sm">Tipo
                  <input name="type" defaultValue={editing?.type ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Secretaria, UBS, Hospital..." />
                </label>
                <label className="text-sm">Subtipo
                  <input name="subtype" defaultValue={editing?.subtype ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm">CNES
                  <input name="cnes" inputMode="numeric" maxLength={7} defaultValue={editing?.cnes ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="7 dígitos" />
                </label>
                <label className="text-sm">CNPJ
                  <input name="cnpj" inputMode="numeric" maxLength={18} defaultValue={editing?.cnpj ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm">Gestão
                  <input name="management" defaultValue={editing?.management ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Municipal" />
                </label>
                <label className="text-sm">Cidade
                  <input name="city" defaultValue={editing?.city ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm">Telefone
                  <input name="phone" defaultValue={editing?.phone ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm sm:col-span-2 lg:col-span-4">Endereço
                  <input name="address" defaultValue={editing?.address ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input name="is_secretariat" type="checkbox" defaultChecked={editing?.is_secretariat ?? false} />
                  Secretaria Municipal de Saúde
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />
                  Estabelecimento ativo
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar estabelecimento'}</button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border bg-white">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Nenhum estabelecimento cadastrado.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((item) => (
                  <div key={item.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-slate-100 p-2"><Building2 size={20} /></div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          {item.name}
                          {item.is_secretariat && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Secretaria de Saúde</span>}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {[item.type, item.subtype, item.cnes && 'CNES ' + item.cnes, item.cnpj && 'CNPJ ' + item.cnpj, role === 'ADMIN' && municipalities.find((m) => m.id === item.municipality_id)?.name].filter(Boolean).join(' • ') || 'Sem identificação SUS cadastrada'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{[item.city, item.address, item.phone].filter(Boolean).join(' • ') || 'Sem endereço/telefone informado'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{item.active ? 'Ativo' : 'Inativo'}</span>
                      {canManage && <button onClick={() => openEdit(item)} className="rounded-lg border p-2 hover:bg-slate-50" title="Editar"><Pencil size={16} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
