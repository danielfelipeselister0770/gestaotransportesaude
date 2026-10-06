'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarClock, Pencil, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Vehicle = { id: string; plate: string; brand: string | null; model: string | null };
type Status = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type Maintenance = {
  id: string; vehicle_id: string; date: string; mileage: number | null; type: string;
  description: string; workshop: string | null; value: number | null;
  next_maintenance_date: string | null; next_maintenance_mileage: number | null;
  status: Status; observations: string | null; vehicle?: Vehicle | null;
};
const labels: Record<Status, string> = { SCHEDULED: 'Agendada', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };

export default function ManutencoesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const [maintenanceResult, vehicleResult] = await Promise.all([
      supabase.from('maintenances')
        .select('id,vehicle_id,date,mileage,type,description,workshop,value,next_maintenance_date,next_maintenance_mileage,status,observations,vehicle:vehicles(id,plate,brand,model)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id,plate,brand,model').order('plate'),
    ]);
    if (maintenanceResult.error) setMessage(`Erro ao carregar manutenções: ${maintenanceResult.error.message}`);
    else {
      const normalized = (maintenanceResult.data ?? []).map((row) => ({
        ...row,
        vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
      })) as Maintenance[];
      setRows(normalized);
    }
    if (vehicleResult.error) setMessage(`Erro ao carregar veículos: ${vehicleResult.error.message}`);
    else setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function openNew() { setEditing(null); setShowForm(true); setMessage(''); }
  function openEdit(row: Maintenance) { setEditing(row); setShowForm(true); setMessage(''); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      vehicle_id: String(form.get('vehicle_id') ?? ''),
      date: String(form.get('date') ?? ''),
      mileage: form.get('mileage') ? Number(form.get('mileage')) : null,
      type: String(form.get('type') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      workshop: String(form.get('workshop') ?? '').trim() || null,
      value: form.get('value') ? Number(form.get('value')) : null,
      next_maintenance_date: String(form.get('next_maintenance_date') ?? '') || null,
      next_maintenance_mileage: form.get('next_maintenance_mileage') ? Number(form.get('next_maintenance_mileage')) : null,
      status: String(form.get('status') ?? 'SCHEDULED') as Status,
      observations: String(form.get('observations') ?? '').trim() || null,
    };
    if (!payload.vehicle_id || !payload.date || !payload.type || !payload.description) {
      setMessage('Informe veículo, data, tipo e descrição.');
      setSaving(false);
      return;
    }
    const result = editing
      ? await supabase.from('maintenances').update(payload).eq('id', editing.id)
      : await supabase.from('maintenances').insert(payload);
    if (result.error) setMessage(`Não foi possível salvar: ${result.error.message}`);
    else {
      setShowForm(false);
      setEditing(null);
      setMessage(editing ? 'Manutenção atualizada.' : 'Manutenção registrada.');
      await loadData();
    }
    setSaving(false);
  }

  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    return (row.vehicle?.plate ?? '').toLowerCase().includes(q) ||
      row.type.toLowerCase().includes(q) ||
      (row.workshop ?? '').toLowerCase().includes(q);
  });

  function statusClass(status: Status) {
    return status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
      status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
      status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
      'bg-amber-50 text-amber-700';
  }

  return (
    <main className="min-h-screen bg-slate-50">
<section className=" p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-2xl font-bold text-slate-900">Manutenções</h1><p className="text-sm text-slate-500">Controle de manutenção e custos da frota.</p></div>
            <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus size={18} /> Nova manutenção</button>
          </div>
          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}
          <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2"><Search size={18} className="text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por placa, tipo ou oficina" className="w-full outline-none text-sm" /></div>
          {showForm && <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{editing ? 'Editar manutenção' : 'Nova manutenção'}</h2><button type="button" onClick={() => setShowForm(false)}><X size={20} /></button></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">Veículo<select name="vehicle_id" required defaultValue={editing?.vehicle_id ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {[v.brand, v.model].filter(Boolean).join(' ')}</option>)}</select></label>
              <label className="text-sm">Data<input name="date" type="datetime-local" required defaultValue={editing?.date?.slice(0,16) ?? new Date().toISOString().slice(0,16)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">KM<input name="mileage" type="number" min="0" defaultValue={editing?.mileage ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Tipo<input name="type" required placeholder="Preventiva, corretiva..." defaultValue={editing?.type ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm sm:col-span-2">Descrição<input name="description" required defaultValue={editing?.description ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Oficina<input name="workshop" defaultValue={editing?.workshop ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Valor<input name="value" type="number" min="0" step="0.01" defaultValue={editing?.value ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Próxima data<input name="next_maintenance_date" type="date" defaultValue={editing?.next_maintenance_date ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Próximo KM<input name="next_maintenance_mileage" type="number" min="0" defaultValue={editing?.next_maintenance_mileage ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="text-sm">Situação<select name="status" defaultValue={editing?.status ?? 'SCHEDULED'} className="mt-1 w-full rounded-lg border px-3 py-2">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm sm:col-span-2 lg:col-span-4">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </form>}
          <div className="overflow-hidden rounded-xl border bg-white">
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma manutenção encontrada.</div> :
              <div className="divide-y">{filtered.map((row) => <div key={row.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><CalendarClock size={20} /></div><div><div className="font-semibold text-slate-900">{row.vehicle?.plate ?? 'Veículo'} • {row.type}</div><div className="text-sm text-slate-500">{new Date(row.date).toLocaleString('pt-BR')} • {row.description}</div><div className="text-xs text-slate-500">{row.workshop ?? 'Sem oficina'}{row.value !== null ? ` • R$ ${row.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}{row.mileage !== null ? ` • KM ${row.mileage.toLocaleString('pt-BR')}` : ''}</div></div></div>
                <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{labels[row.status]}</span><button onClick={() => openEdit(row)} className="rounded-lg border p-2"><Pencil size={16} /></button></div>
              </div>)}</div>
            }
          </div>
        </div>
      </section>
    </main>
  );
}
