'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type RequestRow = {
  id: string;
  date: string;
  time: string;
  origin: string;
  destination: string;
  purpose: string | null;
  needs_companion: boolean;
  patient: { name: string } | null;
};

type Driver = { id: string; name: string };
type Vehicle = { id: string; plate: string; brand: string | null; model: string | null; capacity: number; status: string };
type TripRow = {
  id: string;
  date: string;
  departure_time: string;
  origin: string;
  destination: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  driver: { name: string } | null;
  vehicle: { plate: string; brand: string | null; model: string | null } | null;
  passenger_count: number;
};

const statusLabels = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const statusClasses = {
  SCHEDULED: 'bg-violet-50 text-violet-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

export default function TripsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  async function loadData() {
    setLoading(true);
    const [requestsResult, driversResult, vehiclesResult, tripsResult] = await Promise.all([
      supabase.from('transport_requests')
        .select('id,patient_id,date,time,origin,destination,purpose,needs_companion,patient:patients(name)')
        .eq('status', 'APPROVED')
        .order('date', { ascending: true }).order('time', { ascending: true }),
      supabase.from('drivers').select('id,name').eq('active', true).order('name'),
      supabase.from('vehicles').select('id,plate,brand,model,capacity,status').in('status', ['AVAILABLE']).order('plate'),
      supabase.from('trips')
        .select('id,date,departure_time,origin,destination,status,driver:drivers(name),vehicle:vehicles(plate,brand,model)')
        .order('date', { ascending: false }).order('departure_time', { ascending: false }).limit(100),
    ]);

    const errors = [requestsResult.error, driversResult.error, vehiclesResult.error, tripsResult.error].filter(Boolean);
    if (errors.length) {
      setMessage(`Erro ao carregar agenda: ${errors[0]?.message ?? 'erro desconhecido'}`);
    }

    const normalizedRequests = (requestsResult.data ?? []).map((row) => ({
      ...row,
      patient: Array.isArray(row.patient) ? row.patient[0] ?? null : row.patient,
    })) as RequestRow[];

    const normalizedTrips = (tripsResult.data ?? []).map((row) => ({
      ...row,
      driver: Array.isArray(row.driver) ? row.driver[0] ?? null : row.driver,
      vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
      passenger_count: 0,
    })) as TripRow[];

    if (normalizedTrips.length) {
      const tripIds = normalizedTrips.map((trip) => trip.id);
      const { data: passengers } = await supabase.from('trip_passengers').select('trip_id').in('trip_id', tripIds);
      const counts = (passengers ?? []).reduce<Record<string, number>>((acc, item) => {
        acc[item.trip_id] = (acc[item.trip_id] ?? 0) + 1;
        return acc;
      }, {});
      normalizedTrips.forEach((trip) => { trip.passenger_count = counts[trip.id] ?? 0; });
    }

    setRequests(normalizedRequests);
    setDrivers((driversResult.data ?? []) as Driver[]);
    setVehicles((vehiclesResult.data ?? []) as Vehicle[]);
    setTrips(normalizedTrips);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const selectedRequests = useMemo(
    () => requests.filter((request) => selectedIds.includes(request.id)),
    [requests, selectedIds],
  );

  const selectedPassengerCount = selectedRequests.length;
  const selectedDate = selectedRequests[0]?.date ?? '';

  function toggleRequest(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectByDate(date: string) {
    setSelectedIds(requests.filter((request) => request.date === date).map((request) => request.id));
  }

  async function createTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!selectedRequests.length) {
      setMessage('Selecione pelo menos uma solicitação aprovada.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const date = String(form.get('date') ?? '');
    const departureTime = String(form.get('departure_time') ?? '');
    const driverId = String(form.get('driver_id') ?? '');
    const vehicleId = String(form.get('vehicle_id') ?? '');
    const origin = String(form.get('origin') ?? '').trim();
    const destination = String(form.get('destination') ?? '').trim();

    if (selectedRequests.some((request) => request.date !== date)) {
      setMessage('As solicitações selecionadas precisam ser da mesma data da viagem.');
      return;
    }

    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) {
      setMessage('Selecione um veículo disponível.');
      return;
    }

    if (selectedPassengerCount > vehicle.capacity) {
      setMessage(`O veículo selecionado comporta ${vehicle.capacity} passageiro(s), mas foram selecionados ${selectedPassengerCount}.`);
      return;
    }

    setSaving(true);

    const { data: conflictTrips } = await supabase.from('trips')
      .select('id,driver_id,vehicle_id,departure_time,status')
      .eq('date', date)
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .or(`driver_id.eq.${driverId},vehicle_id.eq.${vehicleId}`);

    const driverConflict = (conflictTrips ?? []).find((item) => item.driver_id === driverId);
    const vehicleConflict = (conflictTrips ?? []).find((item) => item.vehicle_id === vehicleId);

    if (driverConflict) {
      setMessage('O motorista já possui uma viagem agendada ou em andamento nesta data.');
      setSaving(false);
      return;
    }

    if (vehicleConflict) {
      setMessage('O veículo já possui uma viagem agendada ou em andamento nesta data.');
      setSaving(false);
      return;
    }

    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) {
      setMessage('Sessão expirada. Faça login novamente.');
      setSaving(false);
      return;
    }

    const { data: driverData } = await supabase
      .from('drivers')
      .select('municipality_id')
      .eq('id', driverId)
      .maybeSingle();

    if (!driverData?.municipality_id) {
      setMessage('O motorista selecionado não está vinculado a uma prefeitura.');
      setSaving(false);
      return;
    }

    const { data: trip, error: tripError } = await supabase.from('trips').insert({
      date,
      departure_time: departureTime,
      driver_id: driverId,
      vehicle_id: vehicleId,
      municipality_id: driverData.municipality_id,
      origin,
      destination,
      status: 'SCHEDULED',
      created_by: userResult.user.id,
      observations: String(form.get('observations') ?? '').trim() || null,
    }).select('id').single();

    if (tripError || !trip) {
      setMessage(`Não foi possível criar a viagem: ${tripError?.message ?? 'erro desconhecido'}`);
      setSaving(false);
      return;
    }

    const passengerRows = selectedRequests.map((request) => ({
      trip_id: trip.id,
      patient_id: (request as RequestRow & { patient_id: string }).patient_id,
      request_id: request.id,
      companion: request.needs_companion,
      boarding_status: 'EXPECTED',
    }));

    const { error: passengersError } = await supabase.from('trip_passengers').insert(passengerRows);

    if (passengersError) {
      await supabase.from('trips').update({ status: 'CANCELLED' }).eq('id', trip.id);
      setMessage(`Não foi possível adicionar os passageiros: ${passengersError.message}`);
      setSaving(false);
      return;
    }

    const { error: requestsError } = await supabase.from('transport_requests')
      .update({ status: 'SCHEDULED' })
      .in('id', selectedIds);

    if (requestsError) {
      setMessage(`A viagem foi criada, mas as solicitações não foram atualizadas: ${requestsError.message}`);
    } else {
      setMessage('Viagem criada e solicitações agendadas com sucesso.');
    }

    setSelectedIds([]);
    setShowForm(false);
    await loadData();
    setSaving(false);
  }

  async function updateTripStatus(id: string, status: TripRow['status']) {
    setMessage('');

    const { data: currentTrip, error: tripLoadError } = await supabase.from('trips')
      .select('id,vehicle_id,initial_mileage,status')
      .eq('id', id)
      .single();

    if (tripLoadError || !currentTrip) {
      setMessage(`Não foi possível localizar a viagem: ${tripLoadError?.message ?? 'erro desconhecido'}`);
      return;
    }

    if (status === 'IN_PROGRESS') {
      const { data: vehicle } = await supabase.from('vehicles')
        .select('id,current_mileage,status')
        .eq('id', currentTrip.vehicle_id)
        .single();

      if (!vehicle || vehicle.status !== 'AVAILABLE') {
        setMessage('O veículo não está disponível para iniciar esta viagem.');
        return;
      }

      const { error } = await supabase.from('trips').update({
        status,
        initial_mileage: currentTrip.initial_mileage ?? vehicle.current_mileage,
      }).eq('id', id);

      if (error) {
        setMessage(`Não foi possível iniciar a viagem: ${error.message}`);
        return;
      }

      const { error: vehicleError } = await supabase.from('vehicles')
        .update({ status: 'IN_USE' })
        .eq('id', vehicle.id);

      if (vehicleError) {
        setMessage(`Viagem iniciada, mas não foi possível atualizar o veículo: ${vehicleError.message}`);
        await loadData();
        return;
      }
    } else if (status === 'CANCELLED') {
      const { error } = await supabase.from('trips').update({ status }).eq('id', id);
      if (error) {
        setMessage(`Não foi possível cancelar a viagem: ${error.message}`);
        return;
      }

      const { data: activeTrip } = await supabase.from('trips')
        .select('id')
        .eq('vehicle_id', currentTrip.vehicle_id)
        .in('status', ['SCHEDULED', 'IN_PROGRESS'])
        .neq('id', id)
        .limit(1);

      if (!activeTrip?.length) {
        await supabase.from('vehicles').update({ status: 'AVAILABLE' }).eq('id', currentTrip.vehicle_id);
      }
    } else {
      const { error } = await supabase.from('trips').update({ status }).eq('id', id);
      if (error) {
        setMessage(`Não foi possível atualizar a viagem: ${error.message}`);
        return;
      }
    }

    await loadData();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {[
            ['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],
            ['Veículos','/veiculos'],['Motoristas','/motoristas'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],
            ['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes'],
          ].map(([label, href]) => (
            <Link key={label} href={href} className={`block rounded-lg px-3 py-2 ${label === 'Agenda / Viagens' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="md:ml-64">
        <header className="flex flex-col gap-4 border-b bg-white px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays size={16}/> Planejamento operacional</div>
            <h1 className="mt-1 text-2xl font-bold">Agenda / Viagens</h1>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            <Plus size={18}/> Nova viagem
          </button>
        </header>

        <div className="p-6">
          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

          {showForm && (
            <form onSubmit={createTrip} className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Montar nova viagem</h2>
                  <p className="mt-1 text-xs text-slate-500">{selectedPassengerCount} passageiro(s) selecionado(s)</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field name="date" label="Data" type="date" required defaultValue={selectedDate}/>
                <Field name="departure_time" label="Horário de saída" type="time" required/>
                <SelectField name="driver_id" label="Motorista" required>
                  <option value="">Selecione</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </SelectField>
                <SelectField name="vehicle_id" label="Veículo" required>
                  <option value="">Selecione</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} — {vehicle.brand ?? ''} {vehicle.model ?? ''} (até {vehicle.capacity})</option>)}
                </SelectField>
                <Field name="origin" label="Origem principal" required placeholder="Ex.: Secretaria de Saúde"/>
                <Field name="destination" label="Destino principal" required placeholder="Ex.: Hospital de referência"/>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span>
                <textarea name="observations" rows={2} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"/>
              </label>

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Criar viagem'}
                </button>
              </div>
            </form>
          )}

          <div className="mb-5 rounded-xl border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold">Solicitações aprovadas</h2>
                <p className="text-xs text-slate-500">Selecione os passageiros que serão agrupados em uma mesma viagem.</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"/>
                <button type="button" onClick={() => dateFilter && selectByDate(dateFilter)} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Selecionar dia</button>
              </div>
            </div>

            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando agenda...</div> :
              requests.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação aprovada aguardando agendamento.</div> :
              <div className="divide-y">
                {requests.filter((request) => !dateFilter || request.date === dateFilter).map((request) => (
                  <label key={request.id} className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-slate-50">
                    <input type="checkbox" checked={selectedIds.includes(request.id)} onChange={() => toggleRequest(request.id)} className="h-4 w-4 rounded border-slate-300"/>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800">{request.patient?.name ?? 'Paciente não encontrado'}</div>
                      <div className="mt-1 text-xs text-slate-500">{request.date.split('-').reverse().join('/')} às {request.time.slice(0,5)} · {request.origin} → {request.destination}</div>
                    </div>
                    <div className="hidden text-xs text-slate-500 md:block">{request.needs_companion ? 'Acompanhante' : 'Sem acompanhante'}</div>
                  </label>
                ))}
              </div>}
          </div>

          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Viagens cadastradas</h2>
            </div>
            {trips.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma viagem cadastrada.</div> :
              <div className="divide-y">
                {trips.map((trip) => (
                  <div key={trip.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <Link href={`/viagens/${trip.id}`} className="block rounded-lg hover:bg-slate-50 md:p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{trip.date.split('-').reverse().join('/')} às {trip.departure_time.slice(0,5)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[trip.status]}`}>{statusLabels[trip.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{trip.origin} → {trip.destination}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{trip.driver?.name ?? 'Motorista não informado'}</span>
                        <span>{trip.vehicle?.plate ?? 'Veículo não informado'}</span>
                        <span className="flex items-center gap-1"><Users size={13}/>{trip.passenger_count} passageiro(s)</span>
                      </div>
                    </Link>
                    <div className="flex gap-2">
                      {trip.status === 'SCHEDULED' && <button onClick={() => updateTripStatus(trip.id, 'IN_PROGRESS')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Iniciar</button>}
                      
                      {(trip.status === 'SCHEDULED' || trip.status === 'IN_PROGRESS') && <button onClick={() => updateTripStatus(trip.id, 'CANCELLED')} className="rounded-lg border px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>}
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({name,label,type='text',placeholder,required,defaultValue}:{name:string;label:string;type?:string;placeholder?:string;required?:boolean;defaultValue?:string}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"/></label>;
}

function SelectField({name,label,required,children}:{name:string;label:string;required?:boolean;children:ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><select name={name} required={required} className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">{children}</select></label>;
}
