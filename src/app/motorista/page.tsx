'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, LogOut, MapPin, Play, RefreshCw, RotateCcw, UserRound, XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type OperationalStatus =
  | 'AGENDADA' | 'A_CAMINHO' | 'CHEGUEI_LOCAL' | 'EM_VIAGEM'
  | 'CHEGUEI_DESTINO' | 'RETORNANDO' | 'NA_BASE' | 'FINALIZADA' | 'CANCELADA';

type Trip = {
  id: string;
  date: string;
  departure_time: string;
  origin: string;
  destination: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  operational_status: OperationalStatus;
  started_at: string | null;
  arrived_origin_at: string | null;
  departed_origin_at: string | null;
  arrived_destination_at: string | null;
  return_started_at: string | null;
  completed_at: string | null;
  estimated_arrival_at: string | null;
  estimated_return_at: string | null;
  route_distance_km: number | null;
  estimated_duration_minutes: number | null;
  vehicle: { plate: string } | null;
  initial_mileage: number | null;
};

type Passenger = {
  id: string;
  boarding_status: 'EXPECTED' | 'BOARDED' | 'NO_SHOW' | 'CANCELLED';
  companion: boolean;
  boarded_at: string | null;
  patient: { name: string } | null;
};

const operationalLabels: Record<OperationalStatus, string> = {
  AGENDADA: 'Agendada',
  A_CAMINHO: 'A caminho do local',
  CHEGUEI_LOCAL: 'Cheguei ao local',
  EM_VIAGEM: 'Em viagem',
  CHEGUEI_DESTINO: 'Cheguei ao destino',
  RETORNANDO: 'Retornando',
  NA_BASE: 'Cheguei à base',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

const actionLabels: Record<string, string> = {
  ARRIVE_ORIGIN: 'Cheguei no local',
  DEPART_ORIGIN: 'Iniciar embarque / sair',
  ARRIVE_DESTINATION: 'Cheguei ao destino',
  RETURN: 'Iniciar retorno',
  ARRIVE_BASE: 'Cheguei à base',
};

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toLocalInput(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DriverPortalPage() {
  const supabase = createClient();
  const [driverName, setDriverName] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [finishMileage, setFinishMileage] = useState('');
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState<'TODAY' | 'SCHEDULE'>('TODAY');
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [etaArrival, setEtaArrival] = useState('');
  const [etaReturn, setEtaReturn] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('OUTROS');
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [showOccurrence, setShowOccurrence] = useState(false);

  const today = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()), []);

  async function loadData() {
    setLoading(true);
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      window.location.href = '/login';
      return;
    }

    const { data: driver, error: driverError } = await supabase
      .from('drivers').select('id,name').eq('profile_id', userId).maybeSingle();

    if (driverError || !driver) {
      setMessage('Sua conta ainda não está vinculada a um cadastro de motorista.');
      setLoading(false);
      return;
    }

    setDriverName(driver.name);

    let query = supabase
      .from('trips')
      .select('id,date,departure_time,origin,destination,status,operational_status,started_at,arrived_origin_at,departed_origin_at,arrived_destination_at,return_started_at,completed_at,estimated_arrival_at,estimated_return_at,route_distance_km,estimated_duration_minutes,initial_mileage,vehicle:vehicles(plate)')
      .eq('driver_id', driver.id)
      .in('status', ['SCHEDULED', 'IN_PROGRESS']);

    query = viewMode === 'TODAY' ? query.eq('date', today) : query.gte('date', today);

    const { data, error } = await query.order('date').order('departure_time');

    if (error) {
      setMessage(`Não foi possível carregar suas viagens: ${error.message}`);
    } else {
      const normalized = (data ?? []).map((trip) => ({
        ...trip,
        vehicle: Array.isArray(trip.vehicle) ? trip.vehicle[0] ?? null : trip.vehicle,
      })) as Trip[];
      setTrips(normalized);

      if (selectedTrip && !normalized.some((trip) => trip.id === selectedTrip)) {
        setSelectedTrip(null);
        setPassengers([]);
      }
    }

    setLoading(false);
  }

  async function loadPassengers(tripId: string) {
    setSelectedTrip(tripId);
    setMessage('');

    const trip = trips.find((item) => item.id === tripId);
    setFinishMileage('');
    setEtaArrival(toLocalInput(trip?.estimated_arrival_at ?? null));
    setEtaReturn(toLocalInput(trip?.estimated_return_at ?? null));

    const { data, error } = await supabase
      .from('trip_passengers')
      .select('id,boarding_status,companion,boarded_at,patient:patients(name)')
      .eq('trip_id', tripId);

    if (error) {
      setMessage(`Não foi possível carregar os passageiros: ${error.message}`);
      return;
    }

    setPassengers((data ?? []).map((row) => ({
      ...row,
      patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
    })) as Passenger[]);
  }

  async function action(trip: Trip, actionName: string, extra: Record<string, unknown> = {}) {
    setActionLoading(trip.id + actionName);
    setMessage('');

    const response = await fetch('/api/motorista/viagem/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: trip.id, action: actionName, ...extra }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível atualizar a viagem.');
      setActionLoading(null);
      return false;
    }

    setMessage(
      actionName === 'START'
        ? `Viagem iniciada. KM inicial: ${result.initialMileage} km.`
        : actionName === 'FINISH'
          ? `Viagem finalizada. ${result.distance} km percorridos.`
          : 'Atualização registrada para o gestor.',
    );

    await loadData();
    await loadPassengers(trip.id);
    setActionLoading(null);
    return true;
  }

  async function startTrip(trip: Trip) {
    await action(trip, 'START', {
      estimatedArrivalAt: etaArrival ? new Date(etaArrival).toISOString() : undefined,
    });
  }

  async function operationalAction(trip: Trip, actionName: string) {
    const extra: Record<string, unknown> = {};
    if (actionName === 'ARRIVE_DESTINATION' || actionName === 'RETURN') {
      if (etaReturn) extra.estimatedReturnAt = new Date(etaReturn).toISOString();
    }
    await action(trip, actionName, extra);
  }

  async function boardPassenger(passenger: Passenger, boarded: boolean) {
    const trip = trips.find((item) => item.id === selectedTrip);
    if (!trip) return;

    const response = await fetch('/api/motorista/viagem/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: trip.id,
        action: boarded ? 'BOARD' : 'NO_SHOW',
        passengerId: passenger.id,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível atualizar o passageiro.');
      return;
    }

    setPassengers((current) => current.map((item) => item.id === passenger.id
      ? { ...item, boarding_status: result.boardingStatus, boarded_at: boarded ? new Date().toISOString() : null }
      : item));
    setMessage('Status do passageiro atualizado para o gestor.');
  }

  async function cancelTrip(trip: Trip) {
    const reason = window.prompt('Informe o motivo do cancelamento:');
    if (!reason?.trim()) return;
    await action(trip, 'CANCEL', { notes: reason.trim() });
  }

  async function finishTrip(trip: Trip) {
    const mileage = Number(finishMileage);
    if (!Number.isFinite(mileage)) {
      setMessage('Informe a quilometragem final.');
      return;
    }
    if (trip.initial_mileage != null && mileage < Number(trip.initial_mileage)) {
      setMessage(`A quilometragem final deve ser igual ou maior que ${trip.initial_mileage} km.`);
      return;
    }
    await action(trip, 'FINISH', { mileage });
  }

  async function saveEstimate(trip: Trip) {
    if (!etaArrival && !etaReturn) {
      setMessage('Informe pelo menos uma previsão.');
      return;
    }
    await action(trip, 'SET_ESTIMATE', {
      estimatedArrivalAt: etaArrival ? new Date(etaArrival).toISOString() : undefined,
      estimatedReturnAt: etaReturn ? new Date(etaReturn).toISOString() : undefined,
    });
  }

  async function addOccurrence() {
    const trip = trips.find((item) => item.id === selectedTrip);
    if (!trip || !occurrenceDescription.trim()) return;

    const response = await fetch('/api/motorista/ocorrencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: trip.id,
        type: occurrenceType,
        description: occurrenceDescription.trim(),
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível registrar a ocorrência.');
      return;
    }

    setOccurrenceDescription('');
    setShowOccurrence(false);
    setMessage('Ocorrência registrada e disponível para o gestor.');
  }

  useEffect(() => { loadData(); }, [viewMode]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const selected = trips.find((trip) => trip.id === selectedTrip);
  const groupedTrips = trips.reduce<Record<string, Trip[]>>((groups, trip) => {
    (groups[trip.date] ??= []).push(trip);
    return groups;
  }, {});

  const nextAction = (trip: Trip) => {
    if (trip.status === 'SCHEDULED') return 'START';
    if (trip.operational_status === 'A_CAMINHO') return 'ARRIVE_ORIGIN';
    if (trip.operational_status === 'CHEGUEI_LOCAL') return 'DEPART_ORIGIN';
    if (trip.operational_status === 'EM_VIAGEM') return 'ARRIVE_DESTINATION';
    if (trip.operational_status === 'CHEGUEI_DESTINO') return 'RETURN';
    if (trip.operational_status === 'RETORNANDO') return 'ARRIVE_BASE';
    return null;
  };

  function toggleDate(date: string) {
    setExpandedDates((current) => ({ ...current, [date]: current[date] === false }));
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <div className="text-lg font-bold">🚐 Transporte Saúde</div>
            <div className="text-sm text-slate-500">Área operacional do motorista</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{driverName}</span>
            <button onClick={signOut} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><LogOut size={16}/> Sair</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        {message && <div className="rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

        <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-2 shadow-sm">
          <button onClick={() => setViewMode('TODAY')} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewMode === 'TODAY' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Hoje</button>
          <button onClick={() => setViewMode('SCHEDULE')} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewMode === 'SCHEDULE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Minha programação</button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Minha programação</h1>
            <p className="text-sm text-slate-500">Acompanhe passageiros, andamento, retorno e previsões.</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={16}/> Atualizar</button>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Carregando...</div>
        ) : trips.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-slate-400" size={32}/>
            <p className="font-medium">{viewMode === 'TODAY' ? 'Nenhuma viagem para hoje' : 'Nenhuma viagem programada'}</p>
            <p className="mt-1 text-sm text-slate-500">As viagens atribuídas a você aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedTrips).map(([date, dateTrips]) => {
              const expanded = expandedDates[date] !== false;
              return (
                <section key={date} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  <button onClick={() => toggleDate(date)} className="flex w-full items-center justify-between border-b bg-slate-50 px-5 py-4 text-left">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{date === today ? 'Hoje' : 'Programação'}</div>
                      <div className="mt-1 font-semibold">{new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
                    </div>
                    {expanded ? <ChevronUp size={19}/> : <ChevronDown size={19}/>}
                  </button>

                  {expanded && <div className="divide-y">
                    {dateTrips.map((trip) => {
                      const next = nextAction(trip);
                      const busy = actionLoading?.startsWith(trip.id);
                      return (
                        <div key={trip.id} className="p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <button onClick={() => loadPassengers(trip.id)} className="min-w-0 text-left">
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                <Clock3 size={15}/> {trip.departure_time.slice(0,5)}
                                <span>•</span><span>{trip.vehicle?.plate ?? 'Sem veículo'}</span>
                              </div>
                              <div className="mt-1 text-lg font-semibold">{trip.origin} → {trip.destination}</div>
                              <div className="mt-1 text-sm font-medium text-slate-600">{operationalLabels[trip.operational_status]}</div>
                              {trip.estimated_arrival_at && <div className="mt-1 text-xs text-slate-500">Previsão destino: {formatTime(trip.estimated_arrival_at)}</div>}
                              {trip.estimated_return_at && <div className="text-xs text-slate-500">Previsão retorno/base: {formatTime(trip.estimated_return_at)}</div>}
                            </button>

                            <div className="flex flex-wrap gap-2">
                              {next === 'START' && <button disabled={busy} onClick={() => startTrip(trip)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Play size={16}/> Iniciar viagem</button>}
                              {next && next !== 'START' && <button disabled={busy} onClick={() => operationalAction(trip, next)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><MapPin size={16}/> {actionLabels[next]}</button>}
                              {trip.status === 'IN_PROGRESS' && <button disabled={busy} onClick={() => finishTrip(trip)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><CheckCircle2 size={16}/> Finalizar</button>}
                              {trip.status !== 'COMPLETED' && <button disabled={busy} onClick={() => cancelTrip(trip)} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle size={16}/> Cancelar</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>}
                </section>
              );
            })}
          </div>
        )}

        {selected && (
          <section className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <div className="rounded-xl border bg-white shadow-sm">
                <div className="border-b px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><h2 className="font-semibold">Passageiros da viagem</h2><p className="text-xs text-slate-500">{selected.origin} → {selected.destination}</p></div>
                    <UserRound size={19} className="text-slate-400"/>
                  </div>
                </div>
                <div className="divide-y">
                  {passengers.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhum passageiro encontrado.</p> : passengers.map((passenger) => (
                    <div key={passenger.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium">{passenger.patient?.name ?? 'Paciente não informado'}</div>
                        <div className="mt-1 text-xs text-slate-500">{passenger.companion ? 'Com acompanhante' : 'Sem acompanhante'} {passenger.boarded_at ? `• embarcou às ${formatTime(passenger.boarded_at)}` : ''}</div>
                      </div>
                      <div className="flex gap-2">
                        <button disabled={selected.status !== 'IN_PROGRESS'} onClick={() => boardPassenger(passenger, true)} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'BOARDED' ? 'bg-emerald-600 text-white' : 'border hover:bg-slate-50'}`}><Check size={13} className="mr-1 inline"/> Embarcou</button>
                        <button disabled={selected.status !== 'IN_PROGRESS'} onClick={() => boardPassenger(passenger, false)} className={`rounded-lg px-3 py-2 text-xs font-medium ${passenger.boarding_status === 'NO_SHOW' ? 'bg-orange-500 text-white' : 'border hover:bg-slate-50'}`}>Não embarcou</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selected.status === 'IN_PROGRESS' && (
                <div className="rounded-xl border bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2"><Clock3 size={19}/><h2 className="font-semibold">Previsões para o gestor</h2></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label><span className="mb-1 block text-sm font-medium">Previsão de chegada</span><input type="datetime-local" value={etaArrival} onChange={(e) => setEtaArrival(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm"/></label>
                    <label><span className="mb-1 block text-sm font-medium">Previsão de retorno à base</span><input type="datetime-local" value={etaReturn} onChange={(e) => setEtaReturn(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm"/></label>
                  </div>
                  <button onClick={() => saveEstimate(selected)} disabled={!!actionLoading} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Atualizar previsão</button>
                  <p className="mt-2 text-xs text-slate-500">Quando houver distância cadastrada, o sistema pode calcular uma previsão inicial automaticamente. A previsão manual pode ser ajustada pelo motorista.</p>
                </div>
              )}

              {selected.status === 'IN_PROGRESS' && (
                <div className="rounded-xl border bg-white shadow-sm">
                  <button onClick={() => setShowOccurrence((value) => !value)} className="flex w-full items-center gap-2 px-5 py-4 text-left font-semibold"><AlertTriangle size={18}/> Registrar ocorrência</button>
                  {showOccurrence && <div className="border-t p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <select value={occurrenceType} onChange={(e) => setOccurrenceType(e.target.value)} className="rounded-lg border px-3 py-2.5 text-sm">
                        <option value="ACIDENTE">Acidente</option><option value="AVARIA">Avaria</option><option value="ATRASO">Atraso</option><option value="COMPORTAMENTO">Comportamento</option><option value="OUTROS">Outros</option>
                      </select>
                      <textarea value={occurrenceDescription} onChange={(e) => setOccurrenceDescription(e.target.value)} rows={3} placeholder="Descreva a ocorrência..." className="rounded-lg border px-3 py-2.5 text-sm"/>
                    </div>
                    <button onClick={addOccurrence} className="mt-3 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Registrar ocorrência</button>
                  </div>}
                </div>
              )}
            </div>

            <aside className="space-y-5">
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold">Resumo da viagem</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <Info label="Status" value={operationalLabels[selected.operational_status]}/>
                  <Info label="KM inicial" value={selected.initial_mileage != null ? `${selected.initial_mileage} km` : '—'}/>
                  <Info label="Previsão destino" value={formatTime(selected.estimated_arrival_at)}/>
                  <Info label="Previsão retorno" value={formatTime(selected.estimated_return_at)}/>
                  <Info label="Distância cadastrada" value={selected.route_distance_km != null ? `${selected.route_distance_km} km` : 'Ainda não cadastrada'}/>
                </div>
              </div>

              {selected.status === 'IN_PROGRESS' && (
                <div className="rounded-xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 font-semibold"><RotateCcw size={18}/> Quilometragem final</div>
                  <p className="mt-2 text-xs text-slate-500">Informe o KM ao retornar à base para concluir a viagem.</p>
                  <input type="number" min="0" value={finishMileage} onChange={(e) => setFinishMileage(e.target.value)} className="mt-3 w-full rounded-lg border px-3 py-2.5 text-sm" placeholder="Ex.: 193250"/>
                  <button onClick={() => finishTrip(selected)} disabled={!!actionLoading} className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Finalizar viagem</button>
                </div>
              )}
            </aside>
          </section>
        )}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"><span className="text-slate-500">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
