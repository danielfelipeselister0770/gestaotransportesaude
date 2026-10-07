'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Vehicle = { id: string; plate: string; brand: string | null; model: string | null };
type Trip = { id: string; date: string; origin: string; destination: string; driver_id:string; driver?:{name:string}|null };
type Driver={id:string;name:string}; type Patient={id:string;name:string};
type Status = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CANCELLED';
type Occurrence = {
  id: string; vehicle_id: string; trip_id: string | null; date: string; type: string;
  description: string; status: Status; responsible: string | null; observations: string | null;
  vehicle?: Vehicle | null; trip?: Trip | null; driver_id:string|null; patient_id:string|null; resolution:string|null; resolved_at:string|null; driver?:Driver|null; patient?:Patient|null;
};

const statusLabels: Record<Status, string> = {
  OPEN: 'Aberta',
  IN_REVIEW: 'Em análise',
  RESOLVED: 'Resolvida',
  CANCELLED: 'Cancelada',
};

export default function OcorrenciasPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Occurrence[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers,setDrivers]=useState<Driver[]>([]); const [patients,setPatients]=useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | Status>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const [occurrenceResult, vehicleResult, tripResult,driverResult,patientResult] = await Promise.all([
      supabase.from('occurrences')
        .select('id,vehicle_id,trip_id,driver_id,patient_id,date,type,description,status,responsible,observations,resolution,resolved_at,vehicle:vehicles(id,plate,brand,model),trip:trips(id,date,origin,destination,driver_id),driver:drivers(id,name),patient:patients(id,name)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id,plate,brand,model').order('plate'),
      supabase.from('trips').select('id,date,origin,destination,driver_id,driver:drivers(name)').order('date', { ascending: false }).limit(100),
      supabase.from('drivers').select('id,name').eq('active',true).order('name'),supabase.from('patients').select('id,name').eq('active',true).order('name'),
    ]);

    if (occurrenceResult.error) setMessage(`Erro ao carregar ocorrências: ${occurrenceResult.error.message}`);
    else {
      const normalized = (occurrenceResult.data ?? []).map((row) => ({
        ...row,
        vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
        trip: Array.isArray(row.trip) ? row.trip[0] ?? null : row.trip, driver:Array.isArray(row.driver)?row.driver[0]??null:row.driver,patient:Array.isArray(row.patient)?row.patient[0]??null:row.patient,
      })) as Occurrence[];
      setRows(normalized);
    }
    if (vehicleResult.error) setMessage(`Erro ao carregar veículos: ${vehicleResult.error.message}`);
    else setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    if (tripResult.error) setMessage(`Erro ao carregar viagens: ${tripResult.error.message}`);
    else setTrips((tripResult.data ?? []) as unknown as Trip[]);
    if(!driverResult.error)setDrivers((driverResult.data??[]) as Driver[]);if(!patientResult.error)setPatients((patientResult.data??[]) as Patient[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function openNew() { setEditing(null); setShowForm(true); setMessage(''); }
  function openEdit(row: Occurrence) { setEditing(row); setShowForm(true); setMessage(''); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      vehicle_id: String(form.get('vehicle_id') ?? ''),
      trip_id: String(form.get('trip_id') ?? '') || null,
      date: String(form.get('date') ?? ''),
      type: String(form.get('type') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      status: String(form.get('status') ?? 'OPEN') as Status,
      responsible: String(form.get('responsible') ?? '').trim() || null,
      observations: String(form.get('observations') ?? '').trim() || null,
      driver_id:String(form.get('driver_id')??'')||null,patient_id:String(form.get('patient_id')??'')||null,resolution:String(form.get('resolution')??'').trim()||null,
    };

    if (!payload.vehicle_id || !payload.date || !payload.type || !payload.description) {
      setMessage('Informe veículo, data, tipo e descrição.');
      setSaving(false);
      return;
    }

    const result = editing
      ? await supabase.from('occurrences').update(payload).eq('id', editing.id)
      : await supabase.from('occurrences').insert(payload);

    if (result.error) setMessage(`Não foi possível salvar: ${result.error.message}`);
    else {
      setShowForm(false);
      setEditing(null);
      setMessage(editing ? 'Ocorrência atualizada.' : 'Ocorrência registrada.');
      await loadData();
    }
    setSaving(false);
  }

  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (row.vehicle?.plate ?? '').toLowerCase().includes(q) ||
      row.type.toLowerCase().includes(q) ||
      row.description.toLowerCase().includes(q) ||
      (row.responsible ?? '').toLowerCase().includes(q);
    return matchesSearch && (status === 'ALL' || row.status === status);
  });

  const counts={total:rows.length,open:rows.filter(r=>r.status==='OPEN').length,review:rows.filter(r=>r.status==='IN_REVIEW').length,resolved:rows.filter(r=>r.status==='RESOLVED').length};

  function statusClass(value: Status) {
    return value === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' :
      value === 'IN_REVIEW' ? 'bg-blue-50 text-blue-700' :
      value === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
      'bg-red-50 text-red-700';
  }

  return (
    <main className="min-h-screen bg-slate-50">
<section className=" p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Ocorrências</h1>
              <p className="text-sm text-slate-500">Registre problemas, incidentes e situações da frota e das viagens.</p>
            </div>
            <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus size={18} /> Nova ocorrência</button>
          </div>

          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Total" value={counts.total}/><Stat label="Abertas" value={counts.open}/><Stat label="Em análise" value={counts.review}/><Stat label="Resolvidas" value={counts.resolved}/></div>
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
              <Search size={18} className="text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por placa, tipo, descrição ou responsável" className="w-full outline-none text-sm" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | Status)} className="rounded-xl border bg-white px-3 py-2 text-sm">
              <option value="ALL">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {showForm && (
            <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">{editing ? 'Editar ocorrência' : 'Nova ocorrência'}</h2>
                <button type="button" onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">Veículo<select name="vehicle_id" required defaultValue={editing?.vehicle_id ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {[v.brand, v.model].filter(Boolean).join(' ')}</option>)}</select></label>
                <label className="text-sm">Viagem relacionada<select name="trip_id" defaultValue={editing?.trip_id ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Nenhuma</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.date} • {t.origin} → {t.destination}</option>)}</select></label>
                <label className="text-sm">Motorista<select name="driver_id" defaultValue={editing?.driver_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Não informado</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="text-sm">Paciente<select name="patient_id" defaultValue={editing?.patient_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Não relacionado</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm">Data<input name="date" type="datetime-local" required defaultValue={editing?.date?.slice(0,16) ?? new Date().toISOString().slice(0,16)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Tipo<input name="type" required placeholder="Atraso, acidente, pane..." defaultValue={editing?.type ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm sm:col-span-2 lg:col-span-4">Descrição<textarea name="description" required rows={3} defaultValue={editing?.description ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm">Status<select name="status" defaultValue={editing?.status ?? 'OPEN'} className="mt-1 w-full rounded-lg border px-3 py-2">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">Responsável<input name="responsible" defaultValue={editing?.responsible ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                <label className="text-sm sm:col-span-2">Resolução<textarea name="resolution" rows={2} placeholder="Obrigatória ao marcar como resolvida" defaultValue={editing?.resolution??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm sm:col-span-2">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations ?? ''} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              </div>
              <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? 'Salvando...' : 'Salvar'}</button></div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border bg-white">
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma ocorrência encontrada.</div> :
              <div className="divide-y">{filtered.map((row) => (
                <div key={row.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-red-50 p-2 text-red-600"><AlertTriangle size={20} /></div>
                    <div>
                      <div className="font-semibold text-slate-900">{row.vehicle?.plate ?? 'Veículo'} • {row.type}</div>
                      <div className="text-sm text-slate-600">{row.description}</div>
                      <div className="text-xs text-slate-500">{new Date(row.date).toLocaleString('pt-BR')}{row.trip ? ` • Viagem ${row.trip.origin} → ${row.trip.destination}` : ''}{row.driver ? ` • Motorista: ${row.driver.name}` : ''}{row.patient ? ` • Paciente: ${row.patient.name}` : ''}{row.responsible ? ` • Resp.: ${row.responsible}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{statusLabels[row.status]}</span>
                    <button onClick={() => openEdit(row)} className="rounded-lg border p-2"><Pencil size={16} /></button>
                  </div>
                </div>
              ))}</div>
            }
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({label,value}:{label:string;value:number}){return <div className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>}
