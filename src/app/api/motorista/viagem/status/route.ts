import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

type Action =
  | 'START'
  | 'ARRIVE_ORIGIN'
  | 'DEPART_ORIGIN'
  | 'ARRIVE_DESTINATION'
  | 'RETURN'
  | 'ARRIVE_BASE'
  | 'FINISH'
  | 'CANCEL'
  | 'BOARD'
  | 'NO_SHOW'
  | 'SET_ESTIMATE';

const now = () => new Date().toISOString();

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export async function POST(request: Request) {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await server
    .from('profiles')
    .select('id,role,municipality_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || profile.role !== 'MOTORISTA') {
    return NextResponse.json({ error: 'Apenas motoristas podem executar esta ação.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    tripId?: string;
    action?: Action;
    mileage?: number;
    passengerId?: string;
    notes?: string;
    estimatedArrivalAt?: string;
    estimatedReturnAt?: string;
    routeDistanceKm?: number;
    estimatedDurationMinutes?: number;
  } | null;

  const tripId = body?.tripId?.trim();
  const action = body?.action;

  if (!tripId || !action) {
    return NextResponse.json({ error: 'Viagem e ação são obrigatórias.' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: driver } = await admin
    .from('drivers')
    .select('id,municipality_id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!driver || driver.municipality_id !== profile.municipality_id) {
    return NextResponse.json({ error: 'Motorista não vinculado corretamente.' }, { status: 403 });
  }

  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('id,driver_id,vehicle_id,status,initial_mileage,final_mileage,municipality_id,operational_status,route_distance_km,estimated_duration_minutes')
    .eq('id', tripId)
    .maybeSingle();

  if (tripError || !trip) return NextResponse.json({ error: 'Viagem não encontrada.' }, { status: 404 });

  if (trip.driver_id !== driver.id || trip.municipality_id !== driver.municipality_id) {
    return NextResponse.json({ error: 'Esta viagem não pertence a você.' }, { status: 403 });
  }

  async function event(eventType: string, extra: Record<string, unknown> = {}) {
    const { error } = await admin.from('trip_events').insert({
      trip_id: trip.id,
      driver_id: driver.id,
      municipality_id: driver.municipality_id,
      event_type: eventType,
      occurred_at: now(),
      created_by: userId,
      ...extra,
    });
    return error;
  }

  if (action === 'BOARD' || action === 'NO_SHOW') {
    if (!body.passengerId) return NextResponse.json({ error: 'Passageiro não informado.' }, { status: 400 });
    if (!['IN_PROGRESS'].includes(trip.status)) {
      return NextResponse.json({ error: 'A viagem precisa estar em andamento.' }, { status: 409 });
    }

    const boardingStatus = action === 'BOARD' ? 'BOARDED' : 'NO_SHOW';
    const { data: passenger, error: passengerReadError } = await admin
      .from('trip_passengers')
      .select('id,patient_id,boarding_status')
      .eq('id', body.passengerId)
      .eq('trip_id', trip.id)
      .maybeSingle();

    if (passengerReadError || !passenger) {
      return NextResponse.json({ error: 'Passageiro não encontrado nesta viagem.' }, { status: 404 });
    }

    const { error } = await admin.from('trip_passengers').update({
      boarding_status: boardingStatus,
      boarded_at: action === 'BOARD' ? now() : null,
      boarding_notes: body.notes?.trim() || null,
    }).eq('id', passenger.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const eventError = await event(action === 'BOARD' ? 'PASSENGER_BOARDED' : 'PASSENGER_NO_SHOW', {
      notes: body.notes?.trim() || null,
    });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 });

    return NextResponse.json({ ok: true, boardingStatus });
  }

  if (action === 'SET_ESTIMATE') {
    if (trip.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'A previsão só pode ser alterada durante a viagem.' }, { status: 409 });
    }

    const estimatedArrivalAt = body.estimatedArrivalAt || null;
    const estimatedReturnAt = body.estimatedReturnAt || null;
    const routeDistanceKm = body.routeDistanceKm;
    const estimatedDurationMinutes = body.estimatedDurationMinutes;

    if (routeDistanceKm != null && (!Number.isFinite(routeDistanceKm) || routeDistanceKm < 0)) {
      return NextResponse.json({ error: 'Distância inválida.' }, { status: 400 });
    }
    if (estimatedDurationMinutes != null && (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes < 1)) {
      return NextResponse.json({ error: 'Tempo estimado inválido.' }, { status: 400 });
    }

    const { error } = await admin.from('trips').update({
      ...(estimatedArrivalAt ? { estimated_arrival_at: estimatedArrivalAt } : {}),
      ...(estimatedReturnAt ? { estimated_return_at: estimatedReturnAt } : {}),
      ...(routeDistanceKm != null ? { route_distance_km: routeDistanceKm } : {}),
      ...(estimatedDurationMinutes != null ? { estimated_duration_minutes: estimatedDurationMinutes } : {}),
    }).eq('id', trip.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  const transition: Record<Action, { status?: string; operational: string; event: string }> = {
    START: { status: 'IN_PROGRESS', operational: 'A_CAMINHO', event: 'TRIP_STARTED' },
    ARRIVE_ORIGIN: { operational: 'CHEGUEI_LOCAL', event: 'ARRIVED_ORIGIN' },
    DEPART_ORIGIN: { operational: 'EM_VIAGEM', event: 'DEPARTED_ORIGIN' },
    ARRIVE_DESTINATION: { operational: 'CHEGUEI_DESTINO', event: 'ARRIVED_DESTINATION' },
    RETURN: { operational: 'RETORNANDO', event: 'RETURN_STARTED' },
    ARRIVE_BASE: { operational: 'NA_BASE', event: 'ARRIVED_BASE' },
    FINISH: { status: 'COMPLETED', operational: 'FINALIZADA', event: 'TRIP_COMPLETED' },
    CANCEL: { status: 'CANCELLED', operational: 'CANCELADA', event: 'TRIP_CANCELLED' },
    BOARD: { operational: trip.operational_status, event: 'PASSENGER_BOARDED' },
    NO_SHOW: { operational: trip.operational_status, event: 'PASSENGER_NO_SHOW' },
    SET_ESTIMATE: { operational: trip.operational_status, event: 'TRIP_STARTED' },
  };

  if (!transition[action]) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  if (action === 'START') {
    if (trip.status !== 'SCHEDULED') return NextResponse.json({ error: 'Apenas viagens agendadas podem ser iniciadas.' }, { status: 409 });

    const { data: vehicle } = await admin
      .from('vehicles')
      .select('id,current_mileage,status,municipality_id')
      .eq('id', trip.vehicle_id)
      .maybeSingle();

    if (!vehicle || vehicle.municipality_id !== driver.municipality_id) {
      return NextResponse.json({ error: 'Veículo da viagem não encontrado.' }, { status: 404 });
    }
    if (vehicle.status !== 'AVAILABLE') {
      return NextResponse.json({ error: 'O veículo não está disponível para iniciar a viagem.' }, { status: 409 });
    }

    const initialMileage = Number(vehicle.current_mileage);
    const startedAt = now();
    let estimatedArrivalAt = body.estimatedArrivalAt || null;

    if (!estimatedArrivalAt && trip.route_distance_km && trip.route_distance_km > 0) {
      const minutes = trip.estimated_duration_minutes ?? Math.max(15, Math.round((Number(trip.route_distance_km) / 50) * 60));
      estimatedArrivalAt = addMinutes(new Date(startedAt), minutes);
    }

    const { error: updateTripError } = await admin.from('trips').update({
      status: 'IN_PROGRESS',
      initial_mileage: initialMileage,
      operational_status: 'A_CAMINHO',
      started_at: startedAt,
      estimated_arrival_at: estimatedArrivalAt,
    }).eq('id', trip.id).eq('status', 'SCHEDULED');

    if (updateTripError) return NextResponse.json({ error: updateTripError.message }, { status: 400 });

    const { error: vehicleError } = await admin.from('vehicles').update({ status: 'IN_USE' }).eq('id', vehicle.id).eq('status', 'AVAILABLE');
    if (vehicleError) {
      await admin.from('trips').update({ status: 'SCHEDULED', initial_mileage: null, operational_status: 'AGENDADA', started_at: null }).eq('id', trip.id);
      return NextResponse.json({ error: vehicleError.message }, { status: 400 });
    }

    const eventError = await event('TRIP_STARTED', { estimated_arrival_at: estimatedArrivalAt });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: 'IN_PROGRESS', operationalStatus: 'A_CAMINHO', initialMileage, estimatedArrivalAt });
  }

  if (action === 'CANCEL') {
    if (trip.status !== 'SCHEDULED' && trip.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Esta viagem não pode mais ser cancelada.' }, { status: 409 });
    }
    const reason = body.notes?.trim();
    if (!reason) return NextResponse.json({ error: 'Informe o motivo do cancelamento.' }, { status: 400 });

    const { error } = await admin.from('trips').update({
      status: 'CANCELLED',
      operational_status: 'CANCELADA',
      cancelled_at: now(),
      cancellation_reason: reason,
    }).eq('id', trip.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (trip.status === 'IN_PROGRESS') {
      await admin.from('vehicles').update({ status: 'AVAILABLE' }).eq('id', trip.vehicle_id).eq('status', 'IN_USE');
    }

    const eventError = await event('TRIP_CANCELLED', { notes: reason });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: 'CANCELLED' });
  }

  const rules: Record<string, { allowed: string[]; operational: string; event: string }> = {
    ARRIVE_ORIGIN: { allowed: ['IN_PROGRESS'], operational: 'CHEGUEI_LOCAL', event: 'ARRIVED_ORIGIN' },
    DEPART_ORIGIN: { allowed: ['IN_PROGRESS'], operational: 'EM_VIAGEM', event: 'DEPARTED_ORIGIN' },
    ARRIVE_DESTINATION: { allowed: ['IN_PROGRESS'], operational: 'CHEGUEI_DESTINO', event: 'ARRIVED_DESTINATION' },
    RETURN: { allowed: ['IN_PROGRESS'], operational: 'RETORNANDO', event: 'RETURN_STARTED' },
    ARRIVE_BASE: { allowed: ['IN_PROGRESS'], operational: 'NA_BASE', event: 'ARRIVED_BASE' },
  };

  if (action === 'FINISH') {
    if (trip.status !== 'IN_PROGRESS') return NextResponse.json({ error: 'Apenas viagens em andamento podem ser finalizadas.' }, { status: 409 });
    const mileage = Number(body.mileage);
    if (!Number.isFinite(mileage) || mileage < 0) return NextResponse.json({ error: 'Informe uma quilometragem final válida.' }, { status: 400 });
    const initialMileage = Number(trip.initial_mileage ?? 0);
    if (mileage < initialMileage) return NextResponse.json({ error: 'A quilometragem final não pode ser menor que a inicial.' }, { status: 400 });

    const completedAt = now();
    const { error: updateTripError } = await admin.from('trips').update({
      status: 'COMPLETED',
      final_mileage: mileage,
      operational_status: 'FINALIZADA',
      completed_at: completedAt,
    }).eq('id', trip.id).eq('status', 'IN_PROGRESS');

    if (updateTripError) return NextResponse.json({ error: updateTripError.message }, { status: 400 });

    const { error: vehicleError } = await admin.from('vehicles').update({ current_mileage: mileage, status: 'AVAILABLE' }).eq('id', trip.vehicle_id);
    if (vehicleError) return NextResponse.json({ error: `Viagem concluída, mas não foi possível atualizar o veículo: ${vehicleError.message}` }, { status: 500 });

    const { data: existingMileage } = await admin.from('mileage_records').select('id').eq('trip_id', trip.id).eq('source', 'TRIP').maybeSingle();
    if (existingMileage) {
      await admin.from('mileage_records').update({ mileage, date: new Date().toISOString(), observations: 'Quilometragem final registrada pelo motorista.' }).eq('id', existingMileage.id);
    } else {
      await admin.from('mileage_records').insert({
        vehicle_id: trip.vehicle_id,
        trip_id: trip.id,
        mileage,
        source: 'TRIP',
        observations: 'Quilometragem final registrada pelo motorista.',
        created_by: userId,
        municipality_id: driver.municipality_id,
      });
    }

    const { data: passengers } = await admin.from('trip_passengers').select('request_id').eq('trip_id', trip.id).not('request_id', 'is', null);
    const requestIds = [...new Set((passengers ?? []).map((row) => row.request_id).filter(Boolean))];
    if (requestIds.length > 0) await admin.from('transport_requests').update({ status: 'COMPLETED' }).in('id', requestIds);

    const eventError = await event('TRIP_COMPLETED', { notes: `KM final: ${mileage}` });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: 'COMPLETED', distance: mileage - initialMileage });
  }

  const rule = rules[action];
  if (!rule || trip.status !== 'IN_PROGRESS' || !rule.allowed.includes(trip.status)) {
    return NextResponse.json({ error: 'Ação não disponível para o estado atual da viagem.' }, { status: 409 });
  }

  const timestamp = now();
  const updates: Record<string, unknown> = {
    operational_status: rule.operational,
  };

  if (action === 'ARRIVE_ORIGIN') updates.arrived_origin_at = timestamp;
  if (action === 'DEPART_ORIGIN') updates.departed_origin_at = timestamp;
  if (action === 'ARRIVE_DESTINATION') updates.arrived_destination_at = timestamp;
  if (action === 'RETURN') updates.return_started_at = timestamp;

  if (action === 'ARRIVE_DESTINATION' && body.estimatedReturnAt) updates.estimated_return_at = body.estimatedReturnAt;
  if (action === 'RETURN' && body.estimatedReturnAt) updates.estimated_return_at = body.estimatedReturnAt;

  const { error: updateError } = await admin.from('trips').update(updates).eq('id', trip.id).eq('status', 'IN_PROGRESS');
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const eventError = await event(rule.event, {
    estimated_arrival_at: body.estimatedArrivalAt || null,
    estimated_return_at: body.estimatedReturnAt || null,
    notes: body.notes?.trim() || null,
  });
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

  return NextResponse.json({ ok: true, operationalStatus: rule.operational });
}
