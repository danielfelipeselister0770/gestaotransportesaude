'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ClipboardList, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type RequestStatus =
  | 'REQUESTED' | 'APPROVED' | 'SCHEDULED' | 'COMPLETED'
  | 'CANCELLED' | 'DENIED' | 'NO_SHOW';

type RequestRow = {
  id: string; date: string; time: string; origin: string; destination: string;
  purpose: string | null; needs_companion: boolean; observations: string | null;
  status: RequestStatus;
  patient: { name: string } | null;
  health_unit: { name: string } | null;
};

type Patient = { id: string; name: string; cpf: string | null };
type HealthUnit = { id: string; name: string; city: string | null };

const statusLabels: Record<RequestStatus, string> = {
  REQUESTED: 'Solicitada', APPROVED: 'Aprovada', SCHEDULED: 'Agendada',
  COMPLETED: 'Concluída', CANCELLED: 'Cancelada', DENIED: 'Negada', NO_SHOW: 'Não compareceu',
};
const statusClasses: Record<RequestStatus, string> = {
  REQUESTED: 'bg-amber-50 text-amber-700', APPROVED: 'bg-blue-50 text-blue-700',
  SCHEDULED: 'bg-violet-50 text-violet-700', COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600', DENIED: 'bg-red-50 text-red-700',
  NO_SHOW: 'bg-orange-50 text-orange-700',
};

export default function RequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [healthUnits, setHealthUnits] = useState<HealthUnit[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequestStatus>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const [requestsResult, patientsResult, unitsResult] = await Promise.all([
      supabase.from('transport_requests')
        .select('id,date,time,origin,destination,purpose,needs_companion,observations,status,patient:patients(name),health_unit:health_units(name)')
        .order('date', { ascending: true }).order('time', { ascending: true }),
      supabase.from('patients').select('id,name,cpf').eq('active', true).order('name'),
      supabase.from('health_units').select('id,name,city').eq('active', true).order('name'),
    ]);

    if (requestsResult.error) setMessage(`Erro ao carregar solicitações: ${requestsResult.error.message}`);
    else {
      const rows = (requestsResult.data ?? []).map((row) => ({
        ...row,
        patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
        health_unit: Array.isArray(row.health_unit) ? row.health_unit[0] ?? null : row.health_unit,
      })) as RequestRow[];
      setRequests(rows);
    }
    if (patientsResult.error) setMessage(`Erro ao carregar pacientes: ${patientsResult.error.message}`);
    else setPatients((patientsResult.data ?? []) as Patient[]);
    if (unitsResult.error) setMessage(`Erro ao carregar unidades: ${unitsResult.error.message}`);
    else setHealthUnits((unitsResult.data ?? []) as HealthUnit[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) { setMessage('Sessão expirada. Faça login novamente.'); setSaving(false); return; }

    const { error } = await supabase.from('transport_requests').insert({
      patient_id: String(form.get('patient_id') ?? ''), requested_by: userResult.user.id,
      date: String(form.get('date') ?? ''), time: String(form.get('time') ?? ''),
      origin: String(form.get('origin') ?? '').trim(), destination: String(form.get('destination') ?? '').trim(),
      health_unit_id: String(form.get('health_unit_id') ?? '') || null,
      purpose: String(form.get('purpose') ?? '').trim() || null,
      needs_companion: form.get('needs_companion') === 'on',
      observations: String(form.get('observations') ?? '').trim() || null, status: 'REQUESTED',
    });
    if (error) setMessage(`Não foi possível criar a solicitação: ${error.message}`);
    else { event.currentTarget.reset(); setShowForm(false); setMessage('Solicitação criada com sucesso.'); await loadData(); }
    setSaving(false);
  }

  async function updateStatus(id: string, status: RequestStatus) {
    setMessage('');
    const payload: Record<string, unknown> = { status };
    if (status === 'APPROVED') {
      const { data: userResult } = await supabase.auth.getUser();
      if (!userResult.user) { setMessage('Sessão expirada. Faça login novamente.'); return; }
      payload.approved_by = userResult.user.id; payload.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('transport_requests').update(payload).eq('id', id);
    if (error) setMessage(`Não foi possível atualizar a solicitação: ${error.message}`);
    else await loadData();
  }

  const filtered = requests.filter((request) => {
    const patientName = request.patient?.name ?? '';
    return (patientName.toLowerCase().includes(search.toLowerCase()) ||
      request.origin.toLowerCase().includes(search.toLowerCase()) ||
      request.destination.toLowerCase().includes(search.toLowerCase())) &&
      (statusFilter === 'ALL' || request.status === statusFilter);
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {[['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],
            ['Veículos','/veiculos'],['Motoristas','/motoristas'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],
            ['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes']].map(([label, href]) => (
            <Link key={label} href={href} className={`block rounded-lg px-3 py-2 ${label === 'Solicitações' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>
          ))}
        </nav>
      </aside>
      <section className="md:ml-64">
        <header className="flex items-center justify-between border-b bg-white px-6 py-5">
          <div><div className="flex items-center gap-2 text-sm text-slate-500"><ClipboardList size={16}/> Atendimento e planejamento</div>
            <h1 className="mt-1 text-2xl font-bold">Solicitações de transporte</h1></div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={18}/> Nova solicitação</button>
        </header>
        <div className="p-6">
          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}
          {showForm && <form onSubmit={createRequest} className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-5 font-semibold">Nova solicitação de transporte</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField name="patient_id" label="Paciente" required><option value="">Selecione o paciente</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}{p.cpf ? ` — ${p.cpf}` : ''}</option>)}</SelectField>
              <SelectField name="health_unit_id" label="Unidade de saúde"><option value="">Selecione, se aplicável</option>{healthUnits.map(u => <option key={u.id} value={u.id}>{u.name}{u.city ? ` — ${u.city}` : ''}</option>)}</SelectField>
              <Field name="date" label="Data do transporte" type="date" required/><Field name="time" label="Horário" type="time" required/>
              <Field name="origin" label="Origem" placeholder="Ex.: residência do paciente" required/><Field name="destination" label="Destino" placeholder="Ex.: Hospital Municipal" required/>
              <Field name="purpose" label="Finalidade" placeholder="Ex.: consulta, exame, tratamento"/>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input name="needs_companion" type="checkbox" className="h-4 w-4 rounded border-slate-300"/> Necessita acompanhante</label>
            <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span><textarea name="observations" rows={3} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" placeholder="Informações importantes para o transporte"/></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Criar solicitação'}</button></div>
          </form>}
          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl border bg-white px-4 py-3"><Search size={18} className="text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por paciente, origem ou destino..." className="w-full bg-transparent text-sm outline-none"/></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | RequestStatus)} className="rounded-xl border bg-white px-4 py-3 text-sm outline-none"><option value="ALL">Todos os status</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="hidden grid-cols-[1.5fr_1fr_1.4fr_1fr_1fr] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase text-slate-500 md:grid"><span>Paciente</span><span>Data / hora</span><span>Origem → destino</span><span>Status</span><span>Ações</span></div>
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando solicitações...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação encontrada.</div> :
              filtered.map(request => <div key={request.id} className="grid gap-3 border-b px-5 py-4 last:border-0 md:grid-cols-[1.5fr_1fr_1.4fr_1fr_1fr] md:items-center md:gap-4">
                <div><div className="font-medium text-slate-800">{request.patient?.name ?? 'Paciente não encontrado'}</div><div className="text-xs text-slate-500">{request.health_unit?.name ?? request.purpose ?? 'Finalidade não informada'}</div></div>
                <div className="text-sm text-slate-600"><div>{new Date(`${request.date}T00:00:00`).toLocaleDateString('pt-BR')}</div><div>{request.time?.slice(0,5)}</div></div>
                <div className="text-sm text-slate-600"><div>{request.origin}</div><div className="text-slate-400">→ {request.destination}</div></div>
                <div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[request.status]}`}>{statusLabels[request.status]}</span>{request.needs_companion && <div className="mt-1 text-xs text-slate-500">Acompanhante</div>}</div>
                <div className="flex flex-wrap gap-2">
                  {request.status === 'REQUESTED' && <><button onClick={() => updateStatus(request.id,'APPROVED')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"><Check size={14}/> Aprovar</button>
                    <button onClick={() => updateStatus(request.id,'DENIED')} className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"><X size={14}/> Negar</button></>}
                  {(request.status === 'REQUESTED' || request.status === 'APPROVED') && <button onClick={() => updateStatus(request.id,'CANCELLED')} className="rounded-lg border px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>}
                </div>
              </div>)}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({name,label,type='text',placeholder,required}:{name:string;label:string;type?:string;placeholder?:string;required?:boolean}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"/></label>;
}
function SelectField({name,label,required,children}:{name:string;label:string;required?:boolean;children:React.ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><select name={name} required={required} className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">{children}</select></label>;
}
