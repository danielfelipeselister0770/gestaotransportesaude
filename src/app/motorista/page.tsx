'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, CarFront, Check, CheckCircle2, ChevronDown, ChevronUp, LogOut, MapPin, Play, RefreshCw, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Trip = {
  id: string;
  date: string;
  departure_time: string;
  origin: string;
  destination: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  vehicle: { plate: string } | null;
  initial_mileage?: number | null;
  observations?: string | null;
};

type Passenger = {
  id: string;
  boarding_status: string;
  companion: boolean;
  patient: { name: string } | null;
  observations?: string | null;
};

const statusLabel: Record<Trip['status'], string> = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export default function DriverPortalPage() {
  const supabase = createClient();
  const [driverName, setDriverName] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengersLoading, setPassengersLoading] = useState(false);
  const passengerRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [finishMileage, setFinishMileage] = useState('');
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState<'TODAY' | 'SCHEDULE'>('TODAY');
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [occurrenceType,setOccurrenceType]=useState('ATRASO');
  const [occurrenceDescription,setOccurrenceDescription]=useState('');

  async function loadData(preserveMessage = false) {
    setLoading(true);
    if (!preserveMessage) setMessage('');

    try {
      const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
      window.location.href = '/login';
      return;
    }

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id,name')
      .eq('profile_id', userId)
      .maybeSingle();

    if (driverError || !driver) {
      setMessage('Sua conta ainda não está vinculada a um cadastro de motorista.');
      return;
    }

    setDriverName(driver.name);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    let tripsQuery = supabase
      .from('trips')
      .select('id,date,departure_time,origin,destination,status,initial_mileage,observations,vehicle:vehicles(plate)')
      .eq('driver_id', driver.id)
      .in('status', ['SCHEDULED', 'IN_PROGRESS']);

    tripsQuery = viewMode === 'TODAY'
      ? tripsQuery.eq('date', today)
      : tripsQuery.gte('date', today);

    const { data, error } = await tripsQuery
      .order('date', { ascending: true })
      .order('departure_time', { ascending: true });

    if (error) {
      setMessage(`Não foi possível carregar suas viagens: ${error.message}`);
    } else {
      const normalized = (data ?? []).map((trip) => ({
        ...trip,
        vehicle: Array.isArray(trip.vehicle) ? trip.vehicle[0] ?? null : trip.vehicle,
      })) as Trip[];
      setTrips(normalized);
      if (selectedTrip && !normalized.some((trip) => trip.id === selectedTrip)) {
        passengerRequestId.current += 1;
        setPassengersLoading(false);
        setSelectedTrip(null);
        setPassengers([]);
        setFinishMileage('');
      }
    }

    } catch {
      setMessage('Falha de conexão ao atualizar a programação. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPassengers(tripId: string) {
    const requestId = ++passengerRequestId.current;
    setSelectedTrip(tripId);
    setPassengers([]);
    setPassengersLoading(true);
    setMessage('');

    const trip = trips.find((item) => item.id === tripId);
    if (trip?.status === 'IN_PROGRESS' && trip.initial_mileage != null) {
      setFinishMileage('');
    }

    try {
      const { data, error } = await supabase
        .from('trip_passengers')
        .select('id,boarding_status,companion,observations,patient:patients(name)')
        .eq('trip_id', tripId);

      if (requestId !== passengerRequestId.current) return;
      if (error) {
        setMessage(`Não foi possível carregar os passageiros: ${error.message}`);
        return;
      }

      setPassengers((data ?? []).map((row) => ({
        ...row,
        patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
      })) as Passenger[]);
    } catch {
      if (requestId === passengerRequestId.current) {
        setMessage('Falha de conexão ao carregar passageiros. Verifique sua internet e selecione a viagem novamente.');
      }
    } finally {
      if (requestId === passengerRequestId.current) setPassengersLoading(false);
    }
  }

  async function updatePassenger(passenger: Passenger, boardingStatus: 'BOARDED'|'NO_SHOW') {
    if (actionLoading) return;
    if (!selectedTripData || selectedTripData.status !== 'IN_PROGRESS') { setMessage('Inicie a viagem antes de registrar embarques.'); return; }
    setActionLoading(passenger.id);
    setMessage('');
    try {
      const response = await fetch('/api/motorista/viagem/passageiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: selectedTripData.id, passengerId: passenger.id, boardingStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? 'Não foi possível atualizar o passageiro.');
      } else {
        setPassengers(current => current.map(p => p.id === passenger.id ? { ...p, boarding_status: boardingStatus } : p));
        setMessage('Situação de embarque atualizada com sucesso.');
      }
    } catch {
      setMessage('Falha de conexão ao atualizar o passageiro. Verifique sua internet e tente novamente.');
    } finally {
      setActionLoading(null);
    }
  }

  async function addOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLoading || !selectedTripData || !occurrenceDescription.trim()) return;
    setActionLoading('occurrence');
    setMessage('');
    try {
      const response = await fetch('/api/motorista/viagem/ocorrencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: selectedTripData.id,
          type: occurrenceType,
          description: occurrenceDescription.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? 'Não foi possível registrar a ocorrência.');
      } else {
        setOccurrenceDescription('');
        setMessage('Ocorrência registrada e enviada para a gestão.');
      }
    } catch {
      setMessage('Falha de conexão ao registrar a ocorrência. Verifique sua internet e tente novamente.');
    } finally {
      setActionLoading(null);
    }
  }

  async function changeTripStatus(trip: Trip, action: 'START' | 'FINISH') {
    if (actionLoading) return;

    let mileage: number | undefined;
    if (action === 'FINISH') {
      mileage = Number(finishMileage);
      if (!finishMileage.trim() || !Number.isFinite(mileage)) {
        setMessage('Informe a quilometragem final.');
        return;
      }
      if (trip.initial_mileage != null && mileage < Number(trip.initial_mileage)) {
        setMessage(`A quilometragem final deve ser igual ou maior que ${trip.initial_mileage} km.`);
        return;
      }
    }

    setActionLoading(trip.id);
    setMessage('');
    try {
      const response = await fetch('/api/motorista/viagem/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: trip.id, action, mileage }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(result.error ?? 'Não foi possível atualizar a viagem.');
        return;
      }

      setMessage(
        action === 'START'
          ? `Viagem iniciada. Quilometragem inicial: ${result.initialMileage} km.`
          : `Viagem finalizada. ${result.distance} km percorridos.`,
      );
      passengerRequestId.current += 1;
      setPassengersLoading(false);
      setSelectedTrip(null);
      setPassengers([]);
      setFinishMileage('');
      await loadData(true);
    } catch {
      setMessage('Falha de conexão ao atualizar a viagem. Verifique sua internet e confira a situação da viagem antes de tentar novamente.');
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    loadData();
  }, [viewMode]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const selectedTripData = trips.find((trip) => trip.id === selectedTrip);

  const groupedTrips = trips.reduce<Record<string, Trip[]>>((groups, trip) => {
    (groups[trip.date] ??= []).push(trip);
    return groups;
  }, {});

  function toggleDate(date: string) {
    setExpandedDates((current) => ({ ...current, [date]: current[date] === false ? true : false }));
  }

  function formatDate(date: string) {
    return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f7f9]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-950">🚐 Transporte Saúde</div>
            <div className="text-sm text-slate-500">Área do motorista</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{driverName}</span>
            <button type="button" onClick={signOut} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        {message && <div role="status" aria-live="polite" className="rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

        <div role="group" aria-label="Filtro de programação" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row">
          <button
            onClick={() => setViewMode('TODAY')}
            aria-pressed={viewMode === 'TODAY'}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${viewMode === 'TODAY' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Hoje
          </button>
          <button
            onClick={() => setViewMode('SCHEDULE')}
            aria-pressed={viewMode === 'SCHEDULE'}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${viewMode === 'SCHEDULE' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Minha programação
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Minha programação</h1>
            <p className="text-sm text-slate-500">Consulte as viagens de hoje ou as próximas viagens já programadas para você.</p>
          </div>
          <button type="button" onClick={() => loadData()} disabled={loading} aria-label={loading ? 'Atualizando programação' : 'Atualizar programação'} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /> {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {loading ? (
          <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><RefreshCw size={22} className="mx-auto mb-3 animate-spin text-teal-700" aria-hidden="true" />Carregando viagens...</div>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-slate-400" size={32} />
            <p className="font-medium">{viewMode === 'TODAY' ? 'Nenhuma viagem para hoje' : 'Nenhuma viagem programada'}</p>
            <p className="mt-1 text-sm text-slate-500">{viewMode === 'TODAY' ? 'Consulte a aba “Minha programação” para ver as próximas viagens.' : 'Quando uma viagem for atribuída a você, ela aparecerá aqui.'}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedTrips).map(([date, dateTrips]) => {
              const expanded = expandedDates[date] !== false;
              return (
                <section key={date} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    onClick={() => toggleDate(date)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-4 border-b bg-slate-50 px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 sm:px-5"
                  >
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {date === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) ? 'Hoje' : 'Programação'}
                      </div>
                      <div className="mt-1 text-base font-bold capitalize text-slate-900">{formatDate(date)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {dateTrips.length} {dateTrips.length === 1 ? 'viagem' : 'viagens'} programada{dateTrips.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    {expanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                  </button>

                  {expanded && (
                    <div className="grid gap-4 p-4 lg:grid-cols-2">
                      {dateTrips.map((trip) => (
              <div key={trip.id} className={`rounded-xl border bg-white p-5 shadow-sm ${selectedTrip === trip.id ? 'ring-2 ring-teal-500' : ''}`}>
                <button type="button" aria-pressed={selectedTrip === trip.id} aria-label={`Ver passageiros da viagem de ${trip.origin} para ${trip.destination}`} onClick={() => loadPassengers(trip.id)} className="w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{statusLabel[trip.status]}</span>
                    <span className="text-sm font-medium text-slate-600">{new Date(trip.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <CalendarDays size={16} /> {trip.departure_time}
                    <CarFront size={16} className="ml-3" /> {trip.vehicle?.plate ?? 'Veículo não informado'}
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex gap-2"><MapPin size={17} className="mt-0.5 shrink-0" /><span><strong>Origem:</strong> {trip.origin}</span></div>
                    <div className="flex gap-2"><MapPin size={17} className="mt-0.5 shrink-0" /><span><strong>Destino:</strong> {trip.destination}</span></div>
                  </div>
                </button>

                <div className="mt-5 border-t pt-4">
                  {trip.status === 'SCHEDULED' ? (
                    <button
                      onClick={() => changeTripStatus(trip, 'START')}
                      disabled={actionLoading === trip.id}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Play size={17} aria-hidden="true" /> {actionLoading === trip.id ? 'Iniciando...' : 'Iniciar viagem'}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-slate-600">
                        Quilometragem inicial: <strong>{trip.initial_mileage ?? '—'} km</strong>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          aria-label="Quilometragem final da viagem"
                          type="number"
                          min={trip.initial_mileage ?? 0}
                          step="1"
                          value={selectedTripData?.id === trip.id ? finishMileage : ''}
                          onChange={(event) => {
                            setSelectedTrip(trip.id);
                            setFinishMileage(event.target.value);
                          }}
                          placeholder="KM final"
                          className="min-w-0 w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        />
                        <button
                          onClick={() => changeTripStatus(trip, 'FINISH')}
                          disabled={actionLoading === trip.id}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          <CheckCircle2 size={17} aria-hidden="true" /> {actionLoading === trip.id ? 'Finalizando...' : 'Finalizar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {selectedTrip && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound size={19} />
              <h2 className="font-semibold">Passageiros da viagem</h2>
            </div>
            {passengersLoading ? (
              <p role="status" className="text-sm text-slate-500">Carregando passageiros...</p>
            ) : passengers.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum passageiro encontrado.</p>
            ) : (
              <div className="divide-y">
                {passengers.map((passenger) => (
                  <div key={passenger.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium">{passenger.patient?.name ?? 'Paciente não informado'}</div>
                      <div className="text-xs text-slate-500">{passenger.companion ? 'Com acompanhante' : 'Sem acompanhante'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" aria-pressed={passenger.boarding_status==='BOARDED'} disabled={actionLoading===passenger.id||selectedTripData?.status!=='IN_PROGRESS'} onClick={()=>updatePassenger(passenger,'BOARDED')} className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 ${passenger.boarding_status==='BOARDED'?'bg-emerald-600 text-white':'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}><Check size={13} className="mr-1 inline"/> {actionLoading===passenger.id ? 'Salvando...' : 'Embarcou'}</button><button type="button" disabled={actionLoading===passenger.id||selectedTripData?.status!=='IN_PROGRESS'} onClick={()=>updatePassenger(passenger,'NO_SHOW')} aria-pressed={passenger.boarding_status==='NO_SHOW'} className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 ${passenger.boarding_status==='NO_SHOW'?'bg-orange-500 text-white':'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}><X size={13} className="mr-1 inline"/> {actionLoading===passenger.id ? 'Salvando...' : 'Faltou'}</button></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTripData && (
          <form onSubmit={addOccurrence} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2"><AlertTriangle size={19}/><h2 className="font-semibold">Registrar ocorrência</h2></div>
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"><select aria-label="Tipo de ocorrência" value={occurrenceType} onChange={e=>setOccurrenceType(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"><option value="ATRASO">Atraso</option><option value="AVARIA">Avaria</option><option value="ACIDENTE">Acidente</option><option value="COMPORTAMENTO">Comportamento</option><option value="OUTROS">Outros</option></select><input aria-label="Descrição da ocorrência" value={occurrenceDescription} onChange={e=>setOccurrenceDescription(e.target.value)} required placeholder="Descreva o ocorrido..." className="min-w-0 rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/><button disabled={actionLoading==='occurrence'} className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">{actionLoading==='occurrence' ? 'Registrando...' : 'Registrar'}</button></div>
          </form>
        )}

      </section>
    </main>
  );
}
