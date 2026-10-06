'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Copy, KeyRound, MessageCircle, Pencil, Plus, Search, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Driver = {
  id: string; name: string; cpf: string | null; phone: string | null; cnh: string | null;
  cnh_category: string | null; cnh_expiration: string | null; active: boolean;
  observations: string | null; profile_id: string | null;
};

type AccessData = {
  email: string | null;
  temporaryPassword: string;
  accessLink: string;
  expiresAt: string;
};

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [accessDriver, setAccessDriver] = useState<Driver | null>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [generatingAccess, setGeneratingAccess] = useState(false);
  const [accessData, setAccessData] = useState<AccessData | null>(null);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase.from('drivers')
      .select('id,name,cpf,phone,cnh,cnh_category,cnh_expiration,active,observations,profile_id')
      .order('name');
    if (error) setMessage('Erro ao carregar motoristas: ' + error.message);
    else setDrivers((data ?? []) as Driver[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function openNew() { setEditing(null); setShowForm(true); setMessage(''); }
  function openEdit(d: Driver) { setEditing(d); setShowForm(true); setMessage(''); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      cpf: String(form.get('cpf') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      cnh: String(form.get('cnh') ?? '').trim() || null,
      cnh_category: String(form.get('cnh_category') ?? '').trim().toUpperCase() || null,
      cnh_expiration: String(form.get('cnh_expiration') ?? '') || null,
      active: form.get('active') === 'on',
      observations: String(form.get('observations') ?? '').trim() || null,
    };
    if (!payload.name) { setMessage('Informe o nome do motorista.'); setSaving(false); return; }
    const result = editing
      ? await supabase.from('drivers').update(payload).eq('id', editing.id)
      : await supabase.from('drivers').insert(payload);
    if (result.error) setMessage('Não foi possível salvar: ' + result.error.message);
    else { setShowForm(false); setEditing(null); setMessage(editing ? 'Motorista atualizado.' : 'Motorista cadastrado.'); await loadData(); }
    setSaving(false);
  }

  function expired(d: Driver) {
    return !!d.cnh_expiration && d.cnh_expiration < new Date().toISOString().slice(0, 10);
  }

  function openAccess(d: Driver) {
    setAccessDriver(d); setAccessEmail(''); setAccessData(null); setMessage('');
  }

  async function generateAccess() {
    if (!accessDriver) return;
    if (!accessDriver.profile_id && !accessEmail.trim()) return;
    setGeneratingAccess(true); setMessage('');
    try {
      const response = await fetch('/api/motoristas/acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          driverId: accessDriver.id,
          email: accessEmail.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível gerar o acesso.');
      setAccessData(result);
      setMessage('Acesso provisório gerado. Copie os dois dados e entregue ao motorista.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o acesso.');
    } finally {
      setGeneratingAccess(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage('Copiado.');
  }

  function sendWhatsApp() {
    if (!accessDriver || !accessData) return;
    const phone = (accessDriver.phone ?? '').replace(/\D/g, '');
    if (!phone) {
      setMessage('Cadastre o telefone do motorista antes de enviar pelo WhatsApp.');
      return;
    }
    const normalizedPhone = phone.length === 10 || phone.length === 11 ? '55' + phone : phone;
    const message = [
      '🚐 *Acesso ao Sistema de Transporte Saúde*',
      '',
      `Olá, ${accessDriver.name}!`,
      '',
      'Seu acesso ao sistema foi criado.',
      '',
      `🔗 *Primeiro acesso:* ${accessData.accessLink}`,
      `👤 *Usuário:* ${accessData.email ?? 'Não informado'}`,
      `🔑 *Senha provisória:* ${accessData.temporaryPassword}`,
      '',
      'Ao entrar, você deverá criar sua senha definitiva.',
      '',
      '⚠️ Não compartilhe esses dados com outras pessoas.'
    ].join('\n');
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.cpf ?? '').toLowerCase().includes(q) || (d.cnh ?? '').toLowerCase().includes(q);
  });

  return <main className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
      <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
      <nav className="space-y-1 text-sm">{[['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],['Veículos','/veiculos'],['Motoristas','/motoristas'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes']].map(([label,href]) =>
        <Link key={label} href={href} className={'block rounded-lg px-3 py-2 ' + (label === 'Motoristas' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50')}>{label}</Link>
      )}</nav>
    </aside>

    <section className="md:ml-64 p-4 md:p-8"><div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold">Motoristas</h1><p className="text-sm text-slate-500">Cadastro, habilitação e acesso dos condutores.</p></div>
        <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus size={18}/> Novo motorista</button>
      </div>

      {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
        <Search size={18} className="text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, CPF ou CNH" className="w-full outline-none text-sm"/>
      </div>

      {showForm && <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{editing ? 'Editar motorista' : 'Novo motorista'}</h2><button type="button" onClick={() => setShowForm(false)}><X size={20}/></button></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm sm:col-span-2">Nome completo<input name="name" required defaultValue={editing?.name ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">CPF<input name="cpf" defaultValue={editing?.cpf ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">Telefone<input name="phone" defaultValue={editing?.phone ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">CNH<input name="cnh" defaultValue={editing?.cnh ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">Categoria<input name="cnh_category" placeholder="B, C, D..." defaultValue={editing?.cnh_category ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"/></label>
          <label className="text-sm">Validade da CNH<input name="cnh_expiration" type="date" defaultValue={editing?.cnh_expiration ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true}/> Motorista ativo</label>
          <label className="text-sm sm:col-span-2 lg:col-span-4">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar motorista'}</button></div>
      </form>}

      {accessDriver && <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="font-semibold">Acesso provisório</h2><p className="text-sm text-slate-500">{accessDriver.name}</p></div>
          <button type="button" onClick={() => { setAccessDriver(null); setAccessData(null); }}><X size={20}/></button>
        </div>

        {!accessData ? <>
          {!accessDriver.profile_id && <label className="block text-sm">E-mail que o motorista usará para entrar
            <input type="email" value={accessEmail} onChange={e => setAccessEmail(e.target.value)} placeholder="motorista@prefeitura.gov.br" className="mt-1 w-full rounded-lg border px-3 py-2"/>
          </label>}
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Nenhum e-mail será enviado. O gestor receberá aqui um link e uma senha provisória para entregar ao motorista.</div>
          <button type="button" disabled={generatingAccess || (!accessDriver.profile_id && !accessEmail.trim())} onClick={generateAccess} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{generatingAccess ? 'Gerando...' : accessDriver.profile_id ? 'Gerar novo acesso' : 'Criar acesso provisório'}</button>
        </> : <>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">Acesso criado com sucesso.</div>
            <p className="mt-1">Entregue ao motorista o link e a senha abaixo. O acesso expira em 24 horas e a senha provisória deve ser trocada no primeiro acesso.</p>
          </div>
          <div className="mt-4 space-y-4">
            <div><label className="text-xs font-semibold uppercase text-slate-500">Usuário (e-mail)</label><div className="mt-1 flex gap-2"><input readOnly value={accessData.email ?? ''} className="w-full rounded-lg border bg-slate-50 px-3 py-2"/><button type="button" onClick={() => copyText(accessData.email ?? '')} className="rounded-lg border px-3"><Copy size={16}/></button></div></div>
            <div><label className="text-xs font-semibold uppercase text-slate-500">Senha provisória</label><div className="mt-1 flex gap-2"><input readOnly value={accessData.temporaryPassword} className="w-full rounded-lg border bg-slate-50 px-3 py-2 font-mono"/><button type="button" onClick={() => copyText(accessData.temporaryPassword)} className="rounded-lg border px-3"><Copy size={16}/></button></div></div>
            <div><label className="text-xs font-semibold uppercase text-slate-500">Link de primeiro acesso</label><div className="mt-1 flex gap-2"><input readOnly value={accessData.accessLink} className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-xs"/><button type="button" onClick={() => copyText(accessData.accessLink)} className="rounded-lg border px-3"><Copy size={16}/></button></div></div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={sendWhatsApp} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <MessageCircle size={17}/> Enviar pelo WhatsApp
            </button>
            <button type="button" onClick={() => { setAccessDriver(null); setAccessData(null); }} className="rounded-lg border px-4 py-2 text-sm">Fechar</button>
          </div>
        </>}
      </div>}

      <div className="overflow-hidden rounded-xl border bg-white">
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando...</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum motorista encontrado.</div> :
          <div className="divide-y">{filtered.map(d => <div key={d.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><UserRound size={20}/></div><div><div className="font-semibold">{d.name}</div><div className="text-sm text-slate-500">{[d.cpf && 'CPF ' + d.cpf,d.phone,d.cnh && 'CNH ' + d.cnh,d.cnh_category && 'Cat. ' + d.cnh_category].filter(Boolean).join(' • ') || 'Sem dados complementares'}</div>{d.cnh_expiration && <div className={'mt-1 flex items-center gap-1 text-xs ' + (expired(d) ? 'font-medium text-red-600' : 'text-slate-500')}>{expired(d) && <AlertTriangle size={13}/>}CNH válida até {new Date(d.cnh_expiration + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}</div></div>
            <div className="flex items-center gap-3"><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (d.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{d.active ? 'Ativo' : 'Inativo'}</span><button onClick={() => openAccess(d)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs hover:bg-slate-50" title="Gerar acesso"><KeyRound size={15}/> {d.profile_id ? 'Gerar novo acesso' : 'Criar acesso'}</button><button onClick={() => openEdit(d)} className="rounded-lg border p-2 hover:bg-slate-50" title="Editar"><Pencil size={16}/></button></div>
          </div>)}</div>}
      </div>
    </div></section>
  </main>;
}
