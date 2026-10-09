'use client';

import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Gauge, Save, UserRound, AlertTriangle, History } from 'lucide-react';
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

type TripHistory = { id:string; action:string; old_status:Trip['status']|null; new_status:Trip['status']|null; note:string|null; changed_at:string };

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
  const [passengersLoadError, setPassengersLoadError] = useState(false);
  const [updatingPassengerId, setUpdatingPassengerId] = useState<string | null>(null);
  const updatingPassengerRef = useRef(false);
  const [initialMileage, setInitialMileage] = useState('');
  const [finalMileage, setFinalMileage] = useState('');
  const [observation, setObservation] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('OUTROS');
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<TripHistory[]>([]);
  const [idCopied, setIdCopied] = useState(false);

  async function loadData() {
    setLoading(true);
    setMessage('');
    setTrip(null);
    setPassengers([]);
    setHistory([]);
    setPassengersLoadError(false);
    const [tripResult, passengersResult, historyResult] = await Promise.all([
      supabase.from('trips')
        .select('id,date,departure_time,origin,destination,initial_mileage,final_mileage,status,observations,driver:drivers(name),vehicle:vehicles(id,plate,brand,model,current_mileage)')
        .eq('id', tripId).single(),
      supabase.from('trip_passengers')
        .select('id,patient_id,request_id,companion,boarding_status,observations,patient:patients(name)')
        .eq('trip_id', tripId).order('created_at'),
      supabase.from('trip_history').select('id,action,old_status,new_status,note,changed_at').eq('trip_id',tripId).order('changed_at',{ascending:false}),
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

    if (passengersResult.error) {
      setPassengersLoadError(true);
      setPassengers([]);
      setMessage(`Erro ao carregar passageiros: ${passengersResult.error.message}`);
    }
    else {
      const normalized = (passengersResult.data ?? []).map((row) => ({
        ...row,
        patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
      })) as Passenger[];
      setPassengers(normalized);
    }
    if (!historyResult.error) setHistory((historyResult.data ?? []) as TripHistory[]);
    setLoading(false);
  }

  useEffect(() => { setIdCopied(false); if (tripId) loadData(); }, [tripId]);

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

    if (status === 'COMPLETED' && initial === null) {
      setMessage('Informe a quilometragem inicial antes de concluir a viagem.');
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

    if (status === 'COMPLETED' && !trip.vehicle?.id) {
      setMessage('Não é possível concluir uma viagem sem veículo vinculado. Confira o cadastro antes de finalizar.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED' && passengersLoadError) {
      setMessage('Não é possível concluir a viagem sem conferir os passageiros. Recarregue a página e tente novamente.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED' && passengers.some((passenger) => passenger.boarding_status === 'EXPECTED')) {
      setMessage('Antes de concluir a viagem, registre Embarcou ou Não compareceu para todos os passageiros ainda aguardando embarque.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED') {
      const { data: currentPassengers, error: currentPassengersError } = await supabase
        .from('trip_passengers')
        .select('id,boarding_status')
        .eq('trip_id', trip.id);

      if (currentPassengersError || !currentPassengers) {
        setMessage(currentPassengersError ? `Não foi possível conferir os passageiros antes da conclusão: ${currentPassengersError.message}` : 'Não foi possível confirmar a lista de passageiros. Tente novamente.');
        setSaving(false);
        return;
      }

      const knownStatuses = new Map(passengers.map((passenger) => [passenger.id, passenger.boarding_status]));
      const passengerListChanged = currentPassengers.length !== passengers.length || currentPassengers.some((passenger) => knownStatuses.get(passenger.id) !== passenger.boarding_status);
      if (passengerListChanged || currentPassengers.some((passenger) => passenger.boarding_status === 'EXPECTED')) {
        setMessage('A lista ou a situação dos passageiros mudou desde a última consulta. Recarregue a viagem, confira os embarques e tente novamente.');
        setSaving(false);
        return;
      }
    }

    const { data: updatedTrip, error } = await supabase.from('trips').update({
      initial_mileage: initial,
      final_mileage: final,
      observations: observation.trim() || null,
      ...(status ? { status, ...(status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}) } : {}),
    }).eq('id', trip.id).eq('status', trip.status).select('id').maybeSingle();

    if (error || !updatedTrip) {
      setMessage(error ? `Não foi possível salvar: ${error.message}` : 'A viagem foi alterada por outro usuário. Recarregue os dados antes de tentar novamente.');
      setSaving(false);
      return;
    }

    if (status === 'COMPLETED') {
      const { data: linkedPassengers, error: passengersError } = await supabase
        .from('trip_passengers')
        .select('request_id')
        .eq('trip_id', trip.id)
        .not('request_id', 'is', null);

      if (passengersError) {
        await loadData();
        setMessage(`Viagem concluída, mas não foi possível localizar as solicitações vinculadas: ${passengersError.message}`);
        setSaving(false);
        return;
      }

      const requestIds = [...new Set((linkedPassengers ?? [])
        .map((item) => item.request_id)
        .filter((id): id is string => Boolean(id)))];

      if (requestIds.length > 0) {
        const { data: updatedRequests, error: requestsError } = await supabase
          .from('transport_requests')
          .update({ status: 'COMPLETED' })
          .in('id', requestIds)
          .select('id');

        if (requestsError || (updatedRequests?.length ?? 0) !== requestIds.length) {
          await loadData();
          setMessage(requestsError ? `Viagem concluída, mas não foi possível atualizar as solicitações para Concluída: ${requestsError.message}` : 'Viagem concluída, mas nem todas as solicitações vinculadas foram atualizadas. Avise a gestão para conferir os registros.');
          setSaving(false);
          return;
        }
      }
    }

    if (trip.initial_mileage === null && initial !== null && trip.vehicle?.id) {
      const { data: initialRecord, error: mileageError } = await supabase.from('mileage_records').insert({
        vehicle_id: trip.vehicle.id,
        trip_id: trip.id,
        date: new Date().toISOString(),
        mileage: initial,
        source: 'TRIP',
        observations: 'Quilometragem inicial da viagem',
      }).select('id').maybeSingle();
      if (mileageError || !initialRecord) {
        await loadData();
        setMessage(mileageError ? `Viagem salva, mas não foi possível registrar o KM inicial: ${mileageError.message}` : 'Viagem salva, mas o registro de KM inicial não foi confirmado. Avise a gestão para conferir os dados.');
        setSaving(false);
        return;
      }
    }

    if (final !== null && trip.vehicle?.id) {
      // O KM final informado na viagem passa a ser a quilometragem atual do veículo,
      // mesmo que a viagem ainda não tenha sido concluída. Assim, todas as telas
      // que consultam vehicles.current_mileage passam a refletir o valor mais recente.
      const { data: updatedVehicle, error: vehicleError } = await supabase.from('vehicles')
        .update({
          current_mileage: final,
          ...(status === 'COMPLETED' ? { status: 'AVAILABLE' } : {}),
        })
        .eq('id', trip.vehicle.id)
        .select('id,current_mileage,status')
        .maybeSingle();

      if (vehicleError) {
        await loadData();
        setMessage(`Viagem salva, mas não foi possível atualizar o KM do veículo: ${vehicleError.message}`);
        setSaving(false);
        return;
      }

      if (!updatedVehicle || Number(updatedVehicle.current_mileage) !== final || (status === 'COMPLETED' && updatedVehicle.status !== 'AVAILABLE')) {
        await loadData();
        setMessage('A viagem foi salva, mas a atualização do veículo não foi confirmada (quilometragem ou disponibilidade). Confira o cadastro do veículo e avise a gestão.');
        setSaving(false);
        return;
      }

      if (status === 'COMPLETED') {
        const { data: existingFinalRecord, error: finalRecordLookupError } = await supabase.from('mileage_records')
          .select('id')
          .eq('trip_id', trip.id)
          .eq('source', 'TRIP')
          .eq('observations', 'Quilometragem final da viagem')
          .maybeSingle();

        if (finalRecordLookupError) {
          setMessage(`Viagem concluída, mas não foi possível conferir o registro de KM final: ${finalRecordLookupError.message}. Avise a gestão antes de tentar novamente.`);
          setSaving(false);
          await loadData();
          return;
        }

        const mileagePayload = {
          vehicle_id: trip.vehicle.id,
          trip_id: trip.id,
          date: new Date().toISOString(),
          mileage: final,
          source: 'TRIP',
          observations: 'Quilometragem final da viagem',
        };

        const mileageResult = existingFinalRecord
          ? await supabase.from('mileage_records').update(mileagePayload).eq('id', existingFinalRecord.id).select('id').maybeSingle()
          : await supabase.from('mileage_records').insert(mileagePayload).select('id').maybeSingle();

        if (mileageResult.error || !mileageResult.data) {
          setMessage(mileageResult.error ? `Viagem concluída, mas não foi possível registrar o KM final: ${mileageResult.error.message}` : 'Viagem concluída, mas o registro de KM final não foi confirmado. Avise a gestão para conferir os dados.');
          setSaving(false);
          await loadData();
          return;
        }
      }
    }

    await loadData();
    setMessage(status === 'COMPLETED' ? 'Viagem concluída com sucesso.' : 'Dados da viagem salvos.');
    setSaving(false);
  }

  async function updatePassenger(id: string, boarding_status: Passenger['boarding_status']) {
    if (trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED') {
      setMessage('A viagem encerrada não permite alterar o status dos passageiros.');
      return;
    }
    if (updatingPassengerRef.current) return;
    const currentPassenger = passengers.find((passenger) => passenger.id === id);
    if (!currentPassenger) {
      setMessage('Passageiro não encontrado nesta viagem. Recarregue os dados.');
      return;
    }
    if (currentPassenger.boarding_status === boarding_status) return;
    updatingPassengerRef.current = true;
    setUpdatingPassengerId(id);
    try {
      const { data, error } = await supabase.from('trip_passengers').update({ boarding_status, boarded_at: boarding_status === 'BOARDED' ? new Date().toISOString() : null }).eq('id', id).eq('trip_id', tripId).eq('boarding_status', currentPassenger.boarding_status).select('id').maybeSingle();
      if (error) setMessage(`Não foi possível atualizar o passageiro: ${error.message}`);
      else if (!data) setMessage('O embarque não foi atualizado. Recarregue a viagem e confira os dados antes de tentar novamente.');
      else setPassengers((current) => current.map((item) => item.id === id ? { ...item, boarding_status } : item));
    } catch {
      setMessage('Não foi possível atualizar o passageiro. Verifique a conexão e tente novamente.');
    } finally {
      updatingPassengerRef.current = false;
      setUpdatingPassengerId(null);
    }
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
      <section className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Link href="/viagens" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16}/> Voltar para Agenda / Viagens</Link>

        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-slate-500">{trip.date.split('-').reverse().join('/')} às {trip.departure_time.slice(0,5)}</div>
              <h1 className="mt-1 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{trip.origin} → {trip.destination}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Identificação da viagem: <span className="select-all break-all font-mono text-slate-700">{trip.id}</span></span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(trip.id); setIdCopied(true); } catch { setIdCopied(false); setMessage("Não foi possível copiar o ID automaticamente. Selecione o código e copie manualmente."); } }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-50" aria-label="Copiar identificação da viagem" aria-live="polite">{idCopied ? <Check size={13} /> : <Copy size={13} />}{idCopied ? "Copiado!" : "Copiar ID"}</button></div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                <span>Motorista: {trip.driver?.name ?? 'Não informado'}</span>
                <span>Veículo: {trip.vehicle?.plate ?? 'Não informado'}</span>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{statusLabels[trip.status]}</span>
          </div>
        </header>

        {message && <div className="mb-5 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

        {trip.status === 'COMPLETED' && passengers.some((passenger) => passenger.boarding_status === 'EXPECTED') && (
          <div role="alert" className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <strong className="block font-semibold">Conferência necessária: passageiros sem situação final</strong>
                <p className="mt-1">Esta viagem está concluída, mas {passengers.filter((passenger) => passenger.boarding_status === 'EXPECTED').length} {passengers.filter((passenger) => passenger.boarding_status === 'EXPECTED').length === 1 ? 'passageiro ainda consta' : 'passageiros ainda constam'} como aguardando embarque. Confira os registros antes de considerar a operação regularizada.</p>
              </div>
            </div>
          </div>
        )}

        {trip.status === 'COMPLETED' && (trip.initial_mileage === null || trip.final_mileage === null || trip.final_mileage < trip.initial_mileage) && (
          <div role="alert" className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <strong className="block font-semibold">Conferência necessária: quilometragem da viagem</strong>
                <p className="mt-1">{trip.initial_mileage === null && trip.final_mileage === null ? "As quilometragens inicial e final não foram registradas." : trip.initial_mileage === null ? "A quilometragem inicial não foi registrada." : trip.final_mileage === null ? "A quilometragem final não foi registrada." : "A quilometragem final é menor que a inicial."} Confira os registros antes de considerar a operação regularizada.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div><h2 className="font-semibold">Passageiros</h2><p className="text-xs text-slate-500">{passengers.length} {passengers.length === 1 ? "passageiro" : "passageiros"} nesta viagem</p></div>
              <UserRound size={20} className="text-slate-400"/>
            </div>
            <div className="divide-y">
              {passengers.map((passenger) => (
                <div key={passenger.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{passenger.patient?.name ?? 'Paciente não encontrado'}</div>
                    <div className="mt-1 text-xs text-slate-500">{passenger.companion ? 'Com acompanhante' : 'Sem acompanhante'}</div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" disabled={saving || updatingPassengerId !== null || trip.status === 'COMPLETED' || trip.status === 'CANCELLED'} aria-pressed={passenger.boarding_status === 'BOARDED'} onClick={() => updatePassenger(passenger.id, 'BOARDED')} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'BOARDED' ? 'bg-emerald-600 text-white' : 'border text-slate-700 hover:bg-slate-50'}`}><Check size={13} className="mr-1 inline"/> Embarcou</button>
                    <button type="button" disabled={saving || updatingPassengerId !== null || trip.status === 'COMPLETED' || trip.status === 'CANCELLED'} aria-pressed={passenger.boarding_status === 'NO_SHOW'} onClick={() => updatePassenger(passenger.id, 'NO_SHOW')} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'NO_SHOW' ? 'bg-orange-500 text-white' : 'border text-slate-700 hover:bg-slate-50'}`}>Não compareceu</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-4"><Gauge size={19}/><h2 className="font-semibold">Quilometragem</h2></div>
            <div className="space-y-4 p-4 sm:p-5">
              <Field label="KM inicial" type="number" value={initialMileage} onChange={setInitialMileage}/>
              <Field label="KM final" type="number" value={finalMileage} onChange={setFinalMileage}/>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span><textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label>
              <button type="button" onClick={() => saveMileage()} disabled={saving || trip.status === 'COMPLETED' || trip.status === 'CANCELLED'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60"><Save size={16}/> Salvar</button>
              {trip.status === 'IN_PROGRESS' && <button type="button" onClick={() => saveMileage('COMPLETED')} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"><Check size={16}/> Salvar e concluir viagem</button>}
            </div>
          </section>
        </div>

        <div className="mt-5 rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-4"><History size={18}/><h2 className="font-semibold">Histórico da viagem</h2></div>
          <div className="p-5">{history.length===0?<p className="text-sm text-slate-500">Sem movimentações registradas.</p>:history.map(h=><div key={h.id} className="mb-3 border-l-2 pl-3 text-sm"><b>{h.action==='CREATED'?'Viagem criada':h.action==='STATUS_CHANGED'?(h.old_status?statusLabels[h.old_status]+' → ':'')+(h.new_status?statusLabels[h.new_status]:''):'Viagem atualizada'}</b><div className="text-xs text-slate-500">{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(h.changed_at))}{h.note?' · '+h.note:''}</div></div>)}</div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-4"><AlertTriangle size={19}/><h2 className="font-semibold">Registrar ocorrência</h2></div>
            <form onSubmit={addOccurrence} className="space-y-4 p-4 sm:p-5">
              <SelectField name="occurrence_type" label="Tipo" value={occurrenceType} onChange={setOccurrenceType}>
                <option value="ACIDENTE">Acidente</option><option value="AVARIA">Avaria</option><option value="ATRASO">Atraso</option><option value="COMPORTAMENTO">Comportamento</option><option value="OUTROS">Outros</option>
              </SelectField>
              <label className="block"><span className="mb-1.5 block text-sm font-medium">Descrição</span><textarea value={occurrenceDescription} onChange={(e) => setOccurrenceDescription(e.target.value)} rows={4} maxLength={1000} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label>
              <button disabled={saving} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">Registrar ocorrência</button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b px-5 py-4"><h2 className="font-semibold">Resumo operacional</h2></div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-5">
              <Summary label="Passageiros" value={String(passengers.length)}/>
              <Summary label="Embarcados" value={String(passengers.filter(p => p.boarding_status === 'BOARDED').length)}/>
              <Summary label="Não compareceram" value={String(passengers.filter(p => p.boarding_status === 'NO_SHOW').length)}/>
              <Summary label="Aguardando embarque" value={String(passengers.filter(p => p.boarding_status === 'EXPECTED').length)}/>
              <Summary label="Cancelados" value={String(passengers.filter(p => p.boarding_status === 'CANCELLED').length)}/>
              <Summary label="KM inicial" value={trip.initial_mileage !== null ? String(trip.initial_mileage) : '—'}/>
              <Summary label="KM final" value={trip.final_mileage !== null ? String(trip.final_mileage) : '—'}/>
              <Summary label="KM percorridos" value={trip.initial_mileage !== null && trip.final_mileage !== null && trip.final_mileage >= trip.initial_mileage ? String(trip.final_mileage - trip.initial_mileage) : '—'}/>
              {trip.status === 'COMPLETED' && <Summary label="Conferência básica" value={(() => { const issues = Number(passengers.some(p => p.boarding_status === 'EXPECTED')) + Number(trip.initial_mileage === null || trip.final_mileage === null || trip.final_mileage < trip.initial_mileage); return passengersLoadError ? 'Conferência incompleta: passageiros indisponíveis' : issues > 0 ? `${issues} ${issues === 1 ? "verificação pendente" : "verificações pendentes"}` : 'Sem alertas nestes critérios'; })()}/>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({label,type,value,onChange}:{label:string;type?:string;value:string;onChange:(value:string)=>void}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input type={type} min={type === 'number' ? '0' : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label>;
}
function SelectField({label,value,onChange,children}:{name?:string;label:string;value:string;onChange:(value:string)=>void;children:ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm">{children}</select></label>;
}
function Summary({label,value}:{label:string;value:string}) {
  return <div className="rounded-lg bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}
