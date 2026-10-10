'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarCheck2, CalendarDays, CheckCircle2, Clock3, Plus, Route, Search, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type RequestRow = {
  id: string;
  patient_id: string;
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
  passenger_count: number | null;
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
  const [tripSearch, setTripSearch] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState<'ALL' | TripRow['status']>('ALL');

  async function loadData() {
    setLoading(true);
    try {
      setMessage((current) => current.startsWith('Erro ao carregar agenda:') || current.startsWith('Não foi possível carregar a agenda:') || current.startsWith('Não foi possível conferir a quantidade de passageiros:') ? '' : current);
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
        passenger_count: null,
      })) as TripRow[];

      if (!tripsResult.error && normalizedTrips.length) {
        const tripIds = normalizedTrips.map((trip) => trip.id);
        const { data: passengers, error: passengerCountError } = await supabase.from('trip_passengers').select('trip_id,companion').in('trip_id', tripIds);
        if (passengerCountError && !errors.length) setMessage(`Não foi possível conferir a quantidade de passageiros: ${passengerCountError.message}`);
        const counts = (passengers ?? []).reduce<Record<string, number>>((acc, item) => {
          acc[item.trip_id] = (acc[item.trip_id] ?? 0) + 1 + (item.companion ? 1 : 0);
          return acc;
        }, {});
        if (!passengerCountError) normalizedTrips.forEach((trip) => { trip.passenger_count = counts[trip.id] ?? 0; });
      }

      if (!requestsResult.error) {
        setRequests(normalizedRequests);
        const approvedIds = new Set(normalizedRequests.map((request) => request.id));
        setSelectedIds((current) => current.filter((id) => approvedIds.has(id)));
      }
      if (!driversResult.error) setDrivers((driversResult.data ?? []) as Driver[]);
      if (!vehiclesResult.error) setVehicles((vehiclesResult.data ?? []) as Vehicle[]);
      if (!tripsResult.error) setTrips(normalizedTrips);

    } catch (error) {
      setMessage(`Não foi possível carregar a agenda: ${error instanceof Error ? error.message : 'erro inesperado'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const selectedRequests = useMemo(
    () => requests.filter((request) => selectedIds.includes(request.id)),
    [requests, selectedIds],
  );

  const selectedPassengerCount = selectedRequests.reduce((total, request) => total + 1 + (request.needs_companion ? 1 : 0), 0);
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

    if (new Set(selectedIds).size !== selectedIds.length || selectedRequests.length !== selectedIds.length) {
      setMessage('A seleção de solicitações está desatualizada ou duplicada. Atualize a agenda e selecione novamente.');
      return;
    }

    if (selectedRequests.some((request) => !request.patient_id)) {
      setMessage('Há uma solicitação sem paciente vinculado. Corrija o cadastro antes de agendar.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const date = String(form.get('date') ?? '');
    const departureTime = String(form.get('departure_time') ?? '');
    const driverId = String(form.get('driver_id') ?? '');
    const vehicleId = String(form.get('vehicle_id') ?? '');
    const origin = String(form.get('origin') ?? '').trim();
    const destination = String(form.get('destination') ?? '').trim();

    if (!date || !departureTime || !origin || !destination) {
      setMessage('Preencha a data, o horário de saída, a origem e o destino da viagem.');
      return;
    }

    if (selectedRequests.some((request) => request.date !== date)) {
      setMessage('As solicitações selecionadas precisam ser da mesma data da viagem.');
      return;
    }

    if (!drivers.some((driver) => driver.id === driverId)) {
      setMessage('Selecione um motorista ativo para esta viagem.');
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

    const { data: conflictTrips, error: conflictError } = await supabase.from('trips')
      .select('id,driver_id,vehicle_id,departure_time,status')
      .eq('date', date)
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .or(`driver_id.eq.${driverId},vehicle_id.eq.${vehicleId}`);

    if (conflictError || !conflictTrips) {
      setMessage(conflictError ? `Não foi possível conferir a disponibilidade do motorista e do veículo: ${conflictError.message}` : 'Não foi possível confirmar a disponibilidade. Tente novamente.');
      setSaving(false);
      return;
    }

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

    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select('municipality_id')
      .eq('id', driverId)
      .eq('active', true)
      .maybeSingle();

    if (driverError) {
      setMessage(`Não foi possível conferir o vínculo do motorista: ${driverError.message}`);
      setSaving(false);
      return;
    }

    if (!driverData?.municipality_id) {
      setMessage('O motorista selecionado não está vinculado a uma prefeitura.');
      setSaving(false);
      return;
    }

    const { data: currentRequests, error: requestsCheckError } = await supabase
      .from('transport_requests')
      .select('id,patient_id,date,time,origin,destination,purpose,status,needs_companion')
      .in('id', selectedIds);

    if (requestsCheckError || !currentRequests) {
      setMessage(requestsCheckError ? `Não foi possível conferir as solicitações: ${requestsCheckError.message}` : 'Não foi possível confirmar as solicitações. Tente novamente.');
      setSaving(false);
      return;
    }

    const currentById = new Map(currentRequests.map((request) => [request.id, request]));
    if (currentById.size !== selectedRequests.length || selectedRequests.some((request) => {
      const current = currentById.get(request.id);
      return !current || current.status !== 'APPROVED' || current.patient_id !== request.patient_id || current.date !== date || current.time !== request.time || current.origin !== request.origin || current.destination !== request.destination || current.purpose !== request.purpose || current.needs_companion !== request.needs_companion;
    })) {
      setMessage('Uma ou mais solicitações foram alteradas ou já agendadas. Atualize a agenda antes de tentar novamente.');
      setSaving(false);
      return;
    }

    const { data: existingLinks, error: linksError } = await supabase
      .from('trip_passengers')
      .select('request_id')
      .in('request_id', selectedIds)
      .limit(1);

    if (linksError || !existingLinks) {
      setMessage('Não foi possível conferir se as solicitações já estão vinculadas a uma viagem.');
      setSaving(false);
      return;
    }

    if (existingLinks.length > 0) {
      setMessage('Uma ou mais solicitações já estão vinculadas a uma viagem. Confira a agenda antes de continuar.');
      setSaving(false);
      return;
    }

    const { data: currentVehicle, error: vehicleCheckError } = await supabase
      .from('vehicles')
      .select('id,status,capacity')
      .eq('id', vehicleId)
      .maybeSingle();

    if (vehicleCheckError || !currentVehicle || currentVehicle.status !== 'AVAILABLE' || currentVehicle.capacity < selectedPassengerCount) {
      setMessage(vehicleCheckError ? `Não foi possível conferir o veículo: ${vehicleCheckError.message}` : 'O veículo não está mais disponível ou não possui capacidade suficiente. Atualize a agenda.');
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
      patient_id: request.patient_id,
      request_id: request.id,
      municipality_id: driverData.municipality_id,
      companion: request.needs_companion,
      boarding_status: 'EXPECTED',
    }));

    const { error: passengersError } = await supabase.from('trip_passengers').insert(passengerRows);

    if (passengersError) {
      const { data: cancelledTrip, error: rollbackError } = await supabase.from('trips')
        .update({ status: 'CANCELLED' })
        .eq('id', trip.id)
        .eq('status', 'SCHEDULED')
        .select('id')
        .maybeSingle();
      const cancellationFailed = Boolean(rollbackError || !cancelledTrip);
      if (cancellationFailed) {
        setSelectedIds([]);
        setShowForm(false);
        await loadData();
      }
      setMessage(cancellationFailed
        ? `Falha ao adicionar passageiros na viagem ${trip.id}: ${passengersError.message}. Não foi possível confirmar o cancelamento automático${rollbackError ? `: ${rollbackError.message}` : ''}. Confira a viagem antes de continuar.`
        : `Não foi possível adicionar os passageiros na viagem ${trip.id}: ${passengersError.message}. O cancelamento automático foi confirmado.`);
      setSaving(false);
      return;
    }

    const { data: updatedRequests, error: requestsError } = await supabase.from('transport_requests')
      .update({ status: 'SCHEDULED' })
      .in('id', selectedIds)
      .eq('status', 'APPROVED')
      .select('id');

    const updatedRequestIds = new Set((updatedRequests ?? []).map((request) => request.id));
    const confirmedCount = selectedIds.filter((id) => updatedRequestIds.has(id)).length;
    if (requestsError || updatedRequestIds.size !== selectedIds.length || selectedIds.some((id) => !updatedRequestIds.has(id))) {
      setSelectedIds([]);
      setShowForm(false);
      await loadData();
      setMessage(requestsError ? `A viagem ${trip.id} foi criada, mas não foi possível confirmar a atualização de todas as solicitações: ${requestsError.message}. Algumas podem ter sido agendadas. Confira os vínculos antes de tentar novamente.` : `A viagem ${trip.id} foi criada, mas apenas ${confirmedCount} de ${selectedIds.length} solicitações selecionadas tiveram atualização confirmada. Confira os vínculos antes de continuar.`);
      setSaving(false);
      return;
    }

    setMessage(`Viagem ${trip.id} criada e solicitações agendadas com sucesso.`);
    setSelectedIds([]);
    setShowForm(false);
    await loadData();
    setSaving(false);
  }

  const filteredTrips = useMemo(() => trips.filter((trip) => {
    const q = tripSearch.trim().toLowerCase();
    const hit = !q || trip.id.toLowerCase().includes(q) || trip.origin.toLowerCase().includes(q) || trip.destination.toLowerCase().includes(q) || (trip.driver?.name ?? '').toLowerCase().includes(q) || (trip.vehicle?.plate ?? '').toLowerCase().includes(q);
    return hit && (tripStatusFilter === 'ALL' || trip.status === tripStatusFilter);
  }), [trips, tripSearch, tripStatusFilter]);

  const tripCounts = useMemo(() => ({
    total: trips.length,
    scheduled: trips.filter(t => t.status === 'SCHEDULED').length,
    progress: trips.filter(t => t.status === 'IN_PROGRESS').length,
    completed: trips.filter(t => t.status === 'COMPLETED').length,
  }), [trips]);

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
      if (currentTrip.status !== 'SCHEDULED') {
        setMessage('Somente uma viagem agendada pode ser iniciada. Atualize a agenda.');
        return;
      }

      const { data: vehicle, error: vehicleLoadError } = await supabase.from('vehicles')
        .select('id,current_mileage,status')
        .eq('id', currentTrip.vehicle_id)
        .single();

      if (vehicleLoadError || !vehicle) {
        setMessage(vehicleLoadError ? `Não foi possível consultar o veículo: ${vehicleLoadError.message}` : 'Não foi possível localizar o veículo da viagem.');
        return;
      }

      if (vehicle.status !== 'AVAILABLE') {
        setMessage('O veículo não está disponível para iniciar esta viagem.');
        return;
      }

      const { data: startedTrip, error } = await supabase.from('trips').update({
        status,
        initial_mileage: currentTrip.initial_mileage ?? vehicle.current_mileage,
      }).eq('id', id).eq('status', 'SCHEDULED').select('id').maybeSingle();

      if (error || !startedTrip) {
        setMessage(error ? `Não foi possível iniciar a viagem: ${error.message}` : 'A viagem foi alterada por outro usuário. Atualize a agenda antes de tentar novamente.');
        return;
      }

      const { data: updatedVehicle, error: vehicleError } = await supabase.from('vehicles')
        .update({ status: 'IN_USE' })
        .eq('id', vehicle.id)
        .eq('status', 'AVAILABLE')
        .select('id')
        .maybeSingle();

      if (vehicleError || !updatedVehicle) {
        setMessage(vehicleError ? `Viagem iniciada, mas não foi possível atualizar o veículo: ${vehicleError.message}` : 'Viagem iniciada, mas o veículo deixou de estar disponível. Confira a situação antes de continuar.');
        await loadData();
        return;
      }
    } else if (status === 'CANCELLED') {
      if (currentTrip.status !== 'SCHEDULED' && currentTrip.status !== 'IN_PROGRESS') {
        setMessage('Esta viagem não pode mais ser cancelada. Atualize a agenda.');
        return;
      }

      const reason = window.prompt('Informe o motivo do cancelamento da viagem:')?.trim();
      if (!reason) return;
      const { data: cancelledTrip, error } = await supabase.from('trips')
        .update({ status, cancellation_reason: reason, cancelled_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', currentTrip.status)
        .select('id')
        .maybeSingle();
      if (error || !cancelledTrip) {
        setMessage(error ? `Não foi possível cancelar a viagem: ${error.message}` : 'A situação da viagem mudou. Atualize a agenda antes de tentar novamente.');
        return;
      }

      const { data: activeTrip, error: activeTripError } = await supabase.from('trips')
        .select('id')
        .eq('vehicle_id', currentTrip.vehicle_id)
        .in('status', ['SCHEDULED', 'IN_PROGRESS'])
        .neq('id', id)
        .limit(1);

      if (activeTripError || !activeTrip) {
        setMessage(activeTripError ? `Viagem cancelada, mas não foi possível conferir outras viagens do veículo: ${activeTripError.message}` : 'Viagem cancelada, mas não foi possível confirmar a disponibilidade do veículo.');
        await loadData();
        return;
      }

      if (currentTrip.status === 'IN_PROGRESS' && activeTrip.length === 0 && currentTrip.vehicle_id) {
        const { data: releasedVehicle, error: releaseError } = await supabase.from('vehicles')
          .update({ status: 'AVAILABLE' })
          .eq('id', currentTrip.vehicle_id)
          .eq('status', 'IN_USE')
          .select('id')
          .maybeSingle();
        if (releaseError || !releasedVehicle) {
          setMessage(releaseError ? `Viagem cancelada, mas não foi possível liberar o veículo: ${releaseError.message}` : 'Viagem cancelada, mas o veículo não estava mais em uso. Confira a disponibilidade dele.');
          await loadData();
          return;
        }
      }
    } else {
      setMessage('Esta mudança de situação deve ser realizada pelo fluxo específico da viagem.');
      return;
    }

    await loadData();
  }

  return (
    <main className="min-h-screen">
<section className="">
        <header className="flex flex-col gap-4 border-b border-slate-200/80 bg-white px-5 py-5 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><CalendarDays size={15}/> Planejamento operacional</div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Agenda / Viagens</h1>
            <p className="mt-1 text-sm text-slate-500">Monte a agenda, agrupe passageiros e acompanhe a execução das viagens.</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
            <Plus size={18}/> Nova viagem
          </button>
        </header>

        <div className="p-5 lg:p-8">
          {message && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">
            <span>{message}</span>
            {((message.startsWith('Erro ao carregar agenda:') || message.startsWith('Não foi possível carregar a agenda:') || message.startsWith('Não foi possível conferir a quantidade de passageiros:'))) && <button type="button" disabled={loading} onClick={() => { setMessage(''); void loadData(); }} className="rounded-lg border border-teal-200 px-3 py-1.5 font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50">Tentar novamente</button>}
          </div>}

          {showForm && (
            <form onSubmit={createTrip} className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-950">Montar nova viagem</h2>
                  <p className="mt-1 text-xs text-slate-500">{selectedPassengerCount} passageiro(s) selecionado(s)</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar formulário de nova viagem" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><X size={18}/></button>
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
                <textarea name="observations" rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/>
              </label>

              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Criar viagem'}
                </button>
              </div>
            </form>
          )}

          <div className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold">Solicitações aprovadas</h2>
                <p className="text-xs text-slate-500">Selecione os passageiros que serão agrupados em uma mesma viagem.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input type="date" aria-label="Filtrar solicitações aprovadas por data" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:w-auto"/>
                <button type="button" disabled={!dateFilter} onClick={() => dateFilter && selectByDate(dateFilter)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Selecionar dia</button>
              </div>
            </div>

            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando agenda...</div> :
              requests.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação aprovada aguardando agendamento.</div> :
              <div className="divide-y">
                {requests.filter((request) => !dateFilter || request.date === dateFilter).map((request) => (
                  <label key={request.id} className="flex cursor-pointer items-start gap-3 px-4 py-4 transition hover:bg-teal-50/40 focus-within:bg-teal-50/50 sm:items-center sm:gap-4 sm:px-5">
                    <input type="checkbox" checked={selectedIds.includes(request.id)} onChange={() => toggleRequest(request.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-700 sm:mt-0"/>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800">{request.patient?.name ?? 'Paciente não encontrado'}</div>
                      <div className="mt-1 break-words text-xs leading-relaxed text-slate-500">{request.date.split('-').reverse().join('/')} às {request.time.slice(0,5)} · {request.origin} → {request.destination}</div>
                    </div>
                    <div className="hidden text-xs text-slate-500 md:block">{request.needs_companion ? 'Acompanhante' : 'Sem acompanhante'}</div>
                  </label>
                ))}
              </div>}
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total de viagens" value={tripCounts.total} icon={<Route size={18}/>}/><Stat label="Agendadas" value={tripCounts.scheduled} icon={<CalendarCheck2 size={18}/>}/><Stat label="Em andamento" value={tripCounts.progress} icon={<Clock3 size={18}/>}/><Stat label="Concluídas" value={tripCounts.completed} icon={<CheckCircle2 size={18}/>}/>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
              <h2 className="font-semibold">Viagens cadastradas</h2>
              <div className="flex flex-col gap-2 sm:flex-row"><div className="flex items-center gap-2 rounded-lg border px-3"><Search size={16}/><input type="search" aria-label="Buscar viagens por identificação, destino, motorista ou placa" value={tripSearch} onChange={e=>setTripSearch(e.target.value)} placeholder="ID, destino, motorista ou placa..." className="py-2 text-sm outline-none"/></div><select aria-label="Filtrar viagens por status" value={tripStatusFilter} onChange={e=>setTripStatusFilter(e.target.value as 'ALL'|TripRow['status'])} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="ALL">Todos os status</option>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            {/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tripSearch.trim()) && (
              <div className="border-b border-teal-100 bg-teal-50 px-5 py-3 text-sm text-teal-900">
                Procurando uma viagem pelo ID? <Link href={`/viagens/${tripSearch.trim()}`} className="font-semibold underline underline-offset-2 hover:text-teal-700">Abrir viagem diretamente</Link>, mesmo que não esteja entre as 100 mais recentes.
              </div>
            )}
            {filteredTrips.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma viagem cadastrada.</div> :
              <div className="divide-y">
                {filteredTrips.map((trip) => (
                  <div key={trip.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between">
                    <Link href={`/viagens/${trip.id}`} className="block rounded-lg hover:bg-slate-50 md:p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{trip.date.split('-').reverse().join('/')} às {trip.departure_time.slice(0,5)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[trip.status]}`}>{statusLabels[trip.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{trip.origin} → {trip.destination}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{trip.driver?.name ?? 'Motorista não informado'}</span>
                        <span>{trip.vehicle?.plate ?? 'Veículo não informado'}</span>
                        <span className="flex items-center gap-1"><Users size={13}/>{trip.passenger_count === null ? 'Contagem indisponível' : `${trip.passenger_count} ocupante(s)`}</span>
                      </div>
                    </Link>
                    <div className="flex gap-2">
                      {trip.status === 'SCHEDULED' && <button onClick={() => updateTripStatus(trip.id, 'IN_PROGRESS')} className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800">Iniciar</button>}
                      
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

function Stat({label,value,icon}:{label:string;value:number;icon:ReactNode}) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</div><div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>; }

function Field({name,label,type='text',placeholder,required,defaultValue}:{name:string;label:string;type?:string;placeholder?:string;required?:boolean;defaultValue?:string}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label>;
}

function SelectField({name,label,required,children}:{name:string;label:string;required?:boolean;children:ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><select name={name} required={required} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{children}</select></label>;
}
