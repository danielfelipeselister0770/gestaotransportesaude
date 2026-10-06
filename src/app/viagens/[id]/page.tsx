'use client';

import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Gauge, Save, UserRound, AlertTriangle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Passenger = {
  id: string;
  patient_id: string;
  request_id: string | null;
  companion: boolean;
  boarding_status: 'EXPECTED' | 'BOARDED' | 'NO_SHOW' | 'CANCELLED';
  observations: string | null;
  patient: { name: string } | null;
};

type Trip = {
  id: string;
  date: string;
  departure_time: string;
  origin: string;
  destination: string;
  initial_mileage: number | null;
  final_mileage: number | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  observations: string | null;
  driver: { name: string } | null;
  vehicle: { id: string; plate: string; brand: string | null; model: string | null; current_mileage: number } | null;
};

const statusLabels = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const tripId = params.id;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [initialMileage, setInitialMileage] = useState('');
  const [finalMileage, setFinalMileage] = useState('');
  const [observation, setObservation] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('OUTROS');
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    const [tripResult, passengersResult] = await Promise.all([
      supabase.from('trips')
        .select('id,date,departure_time,origin,destination,initial_mileage,final_mileage,status,observations,driver:drivers(name),vehicle:vehicles(id,plate,brand,model,current_mileage)')
        .eq('id', tripId).single(),
      supabase.from('trip_passengers')
        .select('id,patient_id,request_id,companion,boarding_status,observations,patient:patients(name)')
        .eq('trip_id', tripId).order('created_at'),
    ]);

    if (tripResult.error) setMessage(`Erro ao carregar viagem: ${tripResult.error.message}`);
    else {
      const row = tripResult.data;
      const normalized = {
        ...row,
        driver: Array.isArray(row.driver) ? row.driver[0] ?? null : row.driver,
        vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
      } as Trip;
      setTrip(normalized);
      setInitialMileage(normalized.initial_mileage?.toString() ?? '');
      setFinalMileage(normalized.final_mileage?.toString() ?? '');
      setObservation(normalized.observations ?? '');
    }

    if (passengersResult.error) setMessage(`Erro ao carregar passageiros: ${passengersResult.error.message}`);
    else {
      const normalized = (passengersResult.data ?? []).map((row) => ({
        ...row,
        patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
      })) as Passenger[];
      setPassengers(normalized);
    }
    setLoading(false);
  }

  useEffect(() => { if (tripId) loadData(); }, [tripId]);

  async function saveMileage(status?: Trip['status']) {
    if (!trip) return;
    setSaving(true);
    setMessage('');

    const initial = initialMileage === '' ? null : Number(initialMileage);
    const final = finalMileage === '' ? null : Number(finalMileage);

    if (initial !== null && (!Number.isFinite(initial) || initial < 0)) {
      setMessage('A quilometragem inicial é inválida.');
      setSaving(false);
      return;
    }

    if (final !== null && (!Number.isFinite(final) || final < 0)) {
      setMessage('A quilometragem final é inválida.');
      setSaving(false);
      return;
    }

    if (initial !== null && final !== null && final < initial) {
      setMessage('A quilometragem final não pode ser menor que a inicial.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED' && final === null) {
      setMessage('Informe a quilometragem final antes de concluir a viagem.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED' && trip.status !== 'IN_PROGRESS') {
      setMessage('Somente uma viagem em andamento pode ser concluída.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('trips').update({
      initial_mileage: initial,
      final_mileage: final,
      observations: observation.trim() || null,
      ...(status ? { status } : {}),
    }).eq('id', trip.id);

    if (error) {
      setMessage(`Não foi possível salvar: ${error.message}`);
      setSaving(false);
      return;
    }

    if (trip.initial_mileage === null && initial !== null && trip.vehicle?.id) {
      const { error: mileageError } = await supabase.from('mileage_records').insert({
        vehicle_id: trip.vehicle.id,
        trip_id: trip.id,
        date: new Date().toISOString(),
        mileage: initial,
        source: 'TRIP',
        observations: 'Quilometragem inicial da viagem',
      });
      if (mileageError) {
        setMessage(`Viagem salva, mas não foi possível registrar o KM inicial: ${mileageError.message}`);
        setSaving(false);
        return;
      }
    }

    if (status === 'COMPLETED' && final !== null && trip.vehicle?.id) {
      const { error: mileageError } = await supabase.from('mileage_records').insert({
        vehicle_id: trip.vehicle.id,
        trip_id: trip.id,
        date: new Date().toISOString(),
        mileage: final,
        source: 'TRIP',
        observations: 'Quilometragem final da viagem',
      });

      if (mileageError) {
        setMessage(`Viagem concluída, mas não foi possível registrar o KM final: ${mileageError.message}`);
        setSaving(false);
        await loadData();
        return;
      }

      const { error: vehicleError } = await supabase.from('vehicles')
        .update({ current_mileage: final, status: 'AVAILABLE' })
        .eq('id', trip.vehicle.id);

      if (vehicleError) {
        setMessage(`Viagem concluída, mas não foi possível atualizar o veículo: ${vehicleError.message}`);
        setSaving(false);
        await loadData();
        return;
      }
    }

    setMessage(status === 'COMPLETED' ? 'Viagem concluída com sucesso.' : 'Dados da viagem salvos.');
    await loadData();
    setSaving(false);
  }

  async function updatePassenger(id: string, boarding_status: Passenger['boarding_status']) {
    if (trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED') {
      setMessage('A viagem encerrada não permite alterar o status dos passageiros.');
      return;
    }
    const { error } = await supabase.from('trip_passengers').update({ boarding_status }).eq('id', id);
    if (error) setMessage(`Não foi possível atualizar o passageiro: ${error.message}`);
    else setPassengers((current) => current.map((item) => item.id === id ? { ...item, boarding_status } : item));
  }

  async function addOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip || !occurrenceDescription.trim()) return;
    setSaving(true);

    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) {
      setMessage('Sessão expirada. Faça login novamente.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('occurrences').insert({
      vehicle_id: trip.vehicle?.id ?? null,
      trip_id: trip.id,
      date: new Date().toISOString(),
      type: occurrenceType,
      description: occurrenceDescription.trim(),
      status: 'OPEN',
      created_by: userResult.user.id,
    });

    if (error) setMessage(`Não foi possível registrar a ocorrência: ${error.message}`);
    else {
      setOccurrenceDescription('');
      setMessage('Ocorrência registrada.');
    }
    setSaving(false);
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 text-center text-sm text-slate-500">Carregando viagem...</main>;

  if (!trip) return <main className="min-h-screen bg-slate-50 p-8"><Link href="/viagens" className="text-sm text-slate-700">← Voltar para viagens</Link><div className="mt-6 rounded-xl border bg-white p-6">Viagem não encontrada.</div></main>;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-6xl p-6">
        <Link href="/viagens" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16}/> Voltar para Agenda / Viagens</Link>

        <header className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-slate-500">{trip.date.split('-').reverse().join('/')} às {trip.departure_time.slice(0,5)}</div>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{trip.origin} → {trip.destination}</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                <span>Motorista: {trip.driver?.name ?? 'Não informado'}</span>
                <span>Veículo: {trip.vehicle?.plate ?? 'Não informado'}</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{statusLabels[trip.status]}</span>
          </div>
        </header>

        {message && <div className="mb-5 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div><h2 className="font-semibold">Passageiros</h2><p className="text-xs text-slate-500">{passengers.length} passageiro(s) nesta viagem</p></div>
              <UserRound size={20} className="text-slate-400"/>
            </div>
            <div className="divide-y">
              {passengers.map((passenger) => (
                <div key={passenger.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{passenger.patient?.name ?? 'Paciente não encontrado'}</div>
                    <div className="mt-1 text-xs text-slate-500">{passenger.companion ? 'Com acompanhante' : 'Sem acompanhante'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updatePassenger(passenger.id, 'BOARDED')} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'BOARDED' ? 'bg-emerald-600 text-white' : 'border text-slate-700 hover:bg-slate-50'}`}><Check size={13} className="mr-1 inline"/> Embarcou</button>
                    <button onClick={() => updatePassenger(passenger.id, 'NO_SHOW')} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'NO_SHOW' ? 'bg-orange-500 text-white' : 'border text-slate-700 hover:bg-slate-50'}`}>Não compareceu</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-4"><Gauge size={19}/><h2 className="font-semibold">Quilometragem</h2></div>
            <div className="space-y-4 p-5">
              <Field label="KM inicial" type="number" value={initialMileage} onChange={setInitialMileage}/>
              <Field label="KM final" type="number" value={finalMileage} onChange={setFinalMileage}/>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span><textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} className="w-full rounded-lg border px-3 py-2.5 text-sm"/></label>
              <button onClick={() => saveMileage()} disabled={saving || trip.status === 'COMPLETED' || trip.status === 'CANCELLED'} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"><Save size={16}/> Salvar</button>
              {trip.status === 'IN_PROGRESS' && <button onClick={() => saveMileage('COMPLETED')} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"><Check size={16}/> Salvar e concluir viagem</button>}
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-4"><AlertTriangle size={19}/><h2 className="font-semibold">Registrar ocorrência</h2></div>
            <form onSubmit={addOccurrence} className="space-y-4 p-5">
              <SelectField name="occurrence_type" label="Tipo" value={occurrenceType} onChange={setOccurrenceType}>
                <option value="ACIDENTE">Acidente</option><option value="AVARIA">Avaria</option><option value="ATRASO">Atraso</option><option value="COMPORTAMENTO">Comportamento</option><option value="OUTROS">Outros</option>
              </SelectField>
              <label className="block"><span className="mb-1.5 block text-sm font-medium">Descrição</span><textarea value={occurrenceDescription} onChange={(e) => setOccurrenceDescription(e.target.value)} rows={4} required className="w-full rounded-lg border px-3 py-2.5 text-sm"/></label>
              <button disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">Registrar ocorrência</button>
            </form>
          </section>

          <section className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-5 py-4"><h2 className="font-semibold">Resumo operacional</h2></div>
            <div className="grid grid-cols-2 gap-4 p-5">
              <Summary label="Passageiros" value={String(passengers.length)}/>
              <Summary label="Embarcados" value={String(passengers.filter(p => p.boarding_status === 'BOARDED').length)}/>
              <Summary label="Não compareceram" value={String(passengers.filter(p => p.boarding_status === 'NO_SHOW').length)}/>
              <Summary label="KM percorridos" value={trip.initial_mileage !== null && trip.final_mileage !== null ? String(trip.final_mileage - trip.initial_mileage) : '—'}/>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({label,type,value,onChange}:{label:string;type?:string;value:string;onChange:(value:string)=>void}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input type={type} min={type === 'number' ? '0' : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm"/></label>;
}
function SelectField({label,value,onChange,children}:{name?:string;label:string;value:string;onChange:(value:string)=>void;children:ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm">{children}</select></label>;
}
function Summary({label,value}:{label:string;value:string}) {
  return <div className="rounded-lg bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}
