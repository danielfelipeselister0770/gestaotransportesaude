'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CarFront, CheckCircle2, LogOut, MapPin, Play, RefreshCw, UserRound } from 'lucide-react';
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
};

type Passenger = {
  id: string;
  boarding_status: string;
  companion: boolean;
  patient: { name: string } | null;
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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [finishMileage, setFinishMileage] = useState('');
  const [message, setMessage] = useState('');

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
      .from('drivers')
      .select('id,name')
      .eq('profile_id', userId)
      .maybeSingle();

    if (driverError || !driver) {
      setMessage('Sua conta ainda não está vinculada a um cadastro de motorista.');
      setLoading(false);
      return;
    }

    setDriverName(driver.name);

    const { data, error } = await supabase
      .from('trips')
      .select('id,date,departure_time,origin,destination,status,initial_mileage,vehicle:vehicles(plate)')
      .eq('driver_id', driver.id)
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
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
        setSelectedTrip(null);
        setPassengers([]);
        setFinishMileage('');
      }
    }

    setLoading(false);
  }

  async function loadPassengers(tripId: string) {
    setSelectedTrip(tripId);
    setMessage('');

    const trip = trips.find((item) => item.id === tripId);
    if (trip?.status === 'IN_PROGRESS' && trip.initial_mileage != null) {
      setFinishMileage('');
    }

    const { data, error } = await supabase
      .from('trip_passengers')
      .select('id,boarding_status,companion,patient:patients(name)')
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

  async function changeTripStatus(trip: Trip, action: 'START' | 'FINISH') {
    setActionLoading(trip.id);
    setMessage('');

    let mileage: number | undefined;
    if (action === 'FINISH') {
      mileage = Number(finishMileage);
      if (!Number.isFinite(mileage)) {
        setMessage('Informe a quilometragem final.');
        setActionLoading(null);
        return;
      }
      if (trip.initial_mileage != null && mileage < Number(trip.initial_mileage)) {
        setMessage(`A quilometragem final deve ser igual ou maior que ${trip.initial_mileage} km.`);
        setActionLoading(null);
        return;
      }
    }

    const response = await fetch('/api/motorista/viagem/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: trip.id, action, mileage }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(result.error ?? 'Não foi possível atualizar a viagem.');
      setActionLoading(null);
      return;
    }

    setMessage(
      action === 'START'
        ? `Viagem iniciada. Quilometragem inicial: ${result.initialMileage} km.`
        : `Viagem finalizada. ${result.distance} km percorridos.`,
    );

    setSelectedTrip(null);
    setPassengers([]);
    setFinishMileage('');
    await loadData();
    setActionLoading(null);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const selectedTripData = trips.find((trip) => trip.id === selectedTrip);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <div className="text-lg font-bold">🚐 Transporte Saúde</div>
            <div className="text-sm text-slate-500">Área do motorista</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{driverName}</span>
            <button onClick={signOut} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        {message && <div className="rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Minhas viagens</h1>
            <p className="text-sm text-slate-500">Confira e acompanhe as viagens atribuídas a você.</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50">
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Carregando...</div>
        ) : trips.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-slate-400" size={32} />
            <p className="font-medium">Nenhuma viagem pendente</p>
            <p className="mt-1 text-sm text-slate-500">Quando uma viagem for atribuída a você, ela aparecerá aqui.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {trips.map((trip) => (
              <div key={trip.id} className={`rounded-xl border bg-white p-5 shadow-sm ${selectedTrip === trip.id ? 'ring-2 ring-slate-300' : ''}`}>
                <button onClick={() => loadPassengers(trip.id)} className="w-full text-left">
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
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Play size={17} /> {actionLoading === trip.id ? 'Iniciando...' : 'Iniciar viagem'}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-slate-600">
                        Quilometragem inicial: <strong>{trip.initial_mileage ?? '—'} km</strong>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={trip.initial_mileage ?? 0}
                          step="1"
                          value={selectedTripData?.id === trip.id ? finishMileage : ''}
                          onChange={(event) => {
                            setSelectedTrip(trip.id);
                            setFinishMileage(event.target.value);
                          }}
                          placeholder="KM final"
                          className="min-w-0 flex-1 rounded-lg border px-3 py-3 text-sm"
                        />
                        <button
                          onClick={() => changeTripStatus(trip, 'FINISH')}
                          disabled={actionLoading === trip.id}
                          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={17} /> {actionLoading === trip.id ? 'Finalizando...' : 'Finalizar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedTrip && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <UserRound size={19} />
              <h2 className="font-semibold">Passageiros da viagem</h2>
            </div>
            {passengers.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum passageiro encontrado.</p>
            ) : (
              <div className="divide-y">
                {passengers.map((passenger) => (
                  <div key={passenger.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-medium">{passenger.patient?.name ?? 'Paciente não informado'}</div>
                      <div className="text-xs text-slate-500">{passenger.companion ? 'Com acompanhante' : 'Sem acompanhante'}</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{passenger.boarding_status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Link href="/motoristas" className="inline-block text-sm text-slate-500 hover:text-slate-900">
          Voltar ao cadastro de motoristas
        </Link>
      </section>
    </main>
  );
}
