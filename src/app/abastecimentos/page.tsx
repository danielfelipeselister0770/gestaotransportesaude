'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Fuel, Pencil, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Vehicle = { id: string; plate: string; brand: string | null; model: string | null };
type Fueling = {
  id: string; vehicle_id: string; date: string; mileage: number; liters: number;
  total_value: number; fuel_type: string | null; observations: string | null;
  vehicle?: Vehicle | null;
};

export default function AbastecimentosPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Fueling[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fueling | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const [fuelings, vehicleResult] = await Promise.all([
      supabase.from('fuelings')
        .select('id,vehicle_id,date,mileage,liters,total_value,fuel_type,observations,vehicle:vehicles(id,plate,brand,model)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id,plate,brand,model').order('plate'),
    ]);

    if (fuelings.error) setMessage(`Erro ao carregar abastecimentos: ${fuelings.error.message}`);
    else {
      const normalized = (fuelings.data ?? []).map((row) => ({
        ...row,
        vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
      })) as Fueling[];
      setRows(normalized);
    }

    if (vehicleResult.error) setMessage(`Erro ao carregar veículos: ${vehicleResult.error.message}`);
    else setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function openNew() {
    setEditing(null);
    setShowForm(true);
    setMessage('');
  }

  function openEdit(row: Fueling) {
    setEditing(row);
    setShowForm(true);
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const form = new FormData(event.currentTarget);
    const payload = {
      vehicle_id: String(form.get('vehicle_id') ?? ''),
      date: String(form.get('date') ?? ''),
      mileage: Number(form.get('mileage') ?? 0),
      liters: Number(form.get('liters') ?? 0),
      total_value: Number(form.get('total_value') ?? 0),
      fuel_type: String(form.get('fuel_type') ?? '').trim() || null,
      observations: String(form.get('observations') ?? '').trim() || null,
    };

    if (!payload.vehicle_id || !payload.date || payload.mileage < 0 || payload.liters <= 0 || payload.total_value < 0) {
      setMessage('Informe veículo, data, KM válida, litros maiores que zero e valor válido.');
      setSaving(false);
      return;
    }

    let result;
    if (editing) {
      result = await supabase.from('fuelings').update(payload).eq('id', editing.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage('Sessão expirada. Entre novamente para registrar o abastecimento.');
        setSaving(false);
        return;
      }
      result = await supabase.from('fuelings').insert({ ...payload, created_by: user.id });
    }

    if (result.error) {
      setMessage(`Não foi possível salvar: ${result.error.message}`);
    } else {
      setShowForm(false);
      setEditing(null);
      setMessage(editing ? 'Abastecimento atualizado.' : 'Abastecimento registrado.');
      await loadData();
    }
    setSaving(false);
  }

  const monthKey=new Date().toISOString().slice(0,7); const monthRows=rows.filter(r=>r.date.slice(0,7)===monthKey); const totalLiters=monthRows.reduce((s,r)=>s+Number(r.liters),0); const totalCost=monthRows.reduce((s,r)=>s+Number(r.total_value),0); const avgPrice=totalLiters?totalCost/totalLiters:0;

  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    return (row.vehicle?.plate ?? '').toLowerCase().includes(q) ||
      (row.fuel_type ?? '').toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen bg-slate-50">
<section className=" p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Abastecimentos</h1>
              <p className="text-sm text-slate-500">Controle de abastecimento e custos da frota.</p>
            </div>
            <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
              <Plus size={18} /> Novo abastecimento
            </button>
          </div>

          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="Custo no mês" value={money(totalCost)}/><Stat label="Litros no mês" value={totalLiters.toLocaleString('pt-BR',{maximumFractionDigits:2})+' L'}/><Stat label="Preço médio/L" value={money(avgPrice)}/></div>

          <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por placa ou combustível" className="w-full outline-none text-sm" />
          </div>

          {showForm && (
            <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">{editing ? 'Editar abastecimento' : 'Novo abastecimento'}</h2>
                <button type="button" onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">Veículo<select name="vehicle_id" required defaultValue={editing?.vehicle_id ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {[v.brand, v.model].filter(Boolean).join(' ')}</option>)}</select></label>
                <label className="text-sm">Data<input name="date" type="datetime-local" required defaultValue={editing?.date?.slice(0,16) ?? new Date().toISOString().slice(0,16)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">KM no abastecimento<input name="mileage" type="number" min="0" required defaultValue={editing?.mileage ?? 0} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Litros<input name="liters" type="number" min="0.01" step="0.01" required defaultValue={editing?.liters ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Valor total<input name="total_value" type="number" min="0" step="0.01" required defaultValue={editing?.total_value ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Combustível<input name="fuel_type" placeholder="Diesel, gasolina..." defaultValue={editing?.fuel_type ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm sm:col-span-2">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border bg-white">
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum abastecimento encontrado.</div> :
              <div className="divide-y">{filtered.map((row) => (
                <div key={row.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><Fuel size={20} /></div><div>
                    <div className="font-semibold text-slate-900">{row.vehicle?.plate ?? 'Veículo'}</div>
                    <div className="text-sm text-slate-500">{new Date(row.date).toLocaleString('pt-BR')} • {row.liters.toLocaleString('pt-BR')} L • R$ {row.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {money(Number(row.total_value)/Number(row.liters))}/L</div>
                    <div className="text-xs text-slate-500">KM {row.mileage.toLocaleString('pt-BR')}{row.fuel_type ? ` • ${row.fuel_type}` : ''}</div>
                  </div></div>
                  <button onClick={() => openEdit(row)} className="self-end rounded-lg border p-2 hover:bg-slate-50"><Pencil size={16} /></button>
                </div>
              ))}</div>
            }
          </div>
        </div>
      </section>
    </main>
  );
}

function money(v:number){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>}
