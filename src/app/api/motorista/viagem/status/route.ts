import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

type Action = 'START' | 'FINISH';

export async function POST(request: Request) {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

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
  } | null;

  const tripId = body?.tripId?.trim();
  const action = body?.action;
  const mileage = body?.mileage;

  if (!tripId || !action || !['START', 'FINISH'].includes(action)) {
    return NextResponse.json({ error: 'Viagem e ação são obrigatórias.' }, { status: 400 });
  }

  if (action === 'FINISH' && (typeof mileage !== 'number' || !Number.isSafeInteger(mileage) || mileage < 0)) {
    return NextResponse.json({ error: 'Informe uma quilometragem final válida.' }, { status: 400 });
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
    .select('id,driver_id,vehicle_id,status,initial_mileage,final_mileage,municipality_id')
    .eq('id', tripId)
    .maybeSingle();

  if (tripError || !trip) {
    return NextResponse.json({ error: 'Viagem não encontrada.' }, { status: 404 });
  }

  if (trip.driver_id !== driver.id || trip.municipality_id !== driver.municipality_id) {
    return NextResponse.json({ error: 'Esta viagem não pertence a você.' }, { status: 403 });
  }

  if (action === 'START') {
    if (trip.status !== 'SCHEDULED') {
      return NextResponse.json({ error: 'Apenas viagens agendadas podem ser iniciadas.' }, { status: 409 });
    }

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

    const { data: startedTrip, error: updateTripError } = await admin
      .from('trips')
      .update({ status: 'IN_PROGRESS', initial_mileage: initialMileage, started_at: new Date().toISOString() })
      .eq('id', trip.id)
      .eq('status', 'SCHEDULED')
      .select('id')
      .maybeSingle();

    if (updateTripError) {
      return NextResponse.json({ error: updateTripError.message }, { status: 400 });
    }

    if (!startedTrip) return NextResponse.json({ error: 'Viagem já iniciada ou alterada. Atualize a programação.' }, { status: 409 });

    const { data: reservedVehicle, error: vehicleError } = await admin
      .from('vehicles')
      .update({ status: 'IN_USE' })
      .eq('id', vehicle.id)
      .eq('status', 'AVAILABLE')
      .select('id')
      .maybeSingle();

    if (vehicleError || !reservedVehicle) {
      await admin.from('trips')
        .update({ status: 'SCHEDULED', initial_mileage: null, started_at: null })
        .eq('id', trip.id)
        .eq('status', 'IN_PROGRESS');
      return NextResponse.json({ error: vehicleError?.message ?? 'O veículo deixou de estar disponível. Atualize a programação.' }, { status: vehicleError ? 400 : 409 });
    }

    return NextResponse.json({ ok: true, status: 'IN_PROGRESS', initialMileage });
  }

  if (trip.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'Apenas viagens em andamento podem ser finalizadas.' }, { status: 409 });
  }

  const finalMileage = Number(mileage);
  const initialMileage = Number(trip.initial_mileage ?? 0);

  if (finalMileage < initialMileage) {
    return NextResponse.json({ error: 'A quilometragem final não pode ser menor que a inicial.' }, { status: 400 });
  }

  const { data: completedTrip, error: updateTripError } = await admin
    .from('trips')
    .update({ status: 'COMPLETED', final_mileage: finalMileage, completed_at: new Date().toISOString() })
    .eq('id', trip.id)
    .eq('status', 'IN_PROGRESS')
    .select('id')
    .maybeSingle();

  if (updateTripError) {
    return NextResponse.json({ error: updateTripError.message }, { status: 400 });
  }
  if (!completedTrip) {
    return NextResponse.json({ error: 'Esta viagem já foi finalizada ou alterada. Atualize a programação antes de tentar novamente.' }, { status: 409 });
  }

  const { data: vehicle, error: vehicleReadError } = await admin
    .from('vehicles')
    .select('id,current_mileage')
    .eq('id', trip.vehicle_id)
    .maybeSingle();

  if (vehicleReadError || !vehicle) {
    return NextResponse.json({ error: 'Viagem concluída, mas não foi possível localizar o veículo.' }, { status: 500 });
  }

  const { data: updatedVehicle, error: vehicleError } = await admin
    .from('vehicles')
    .update({ current_mileage: finalMileage, status: 'AVAILABLE' })
    .eq('id', vehicle.id)
    .eq('status', 'IN_USE')
    .select('id')
    .maybeSingle();

  if (vehicleError || !updatedVehicle) {
    return NextResponse.json({ error: vehicleError
      ? `Viagem concluída, mas não foi possível atualizar o veículo: ${vehicleError.message}`
      : 'Viagem concluída, mas o veículo não estava em uso. Avise a gestão para conferir a situação antes de continuar.' }, { status: vehicleError ? 500 : 409 });
  }

  const { data: existingMileage, error: mileageReadError } = await admin
    .from('mileage_records')
    .select('id')
    .eq('trip_id', trip.id)
    .eq('source', 'TRIP')
    .maybeSingle();

  if (mileageReadError) {
    return NextResponse.json({ error: 'Viagem concluída, mas não foi possível conferir o registro de quilometragem. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }

  let mileageWriteError;
  if (existingMileage) {
    const { error } = await admin
      .from('mileage_records')
      .update({ mileage: finalMileage, date: new Date().toISOString(), observations: 'Quilometragem final registrada pelo motorista.' })
      .eq('id', existingMileage.id);
    mileageWriteError = error;
  } else {
    const { error } = await admin.from('mileage_records').insert({
      vehicle_id: trip.vehicle_id,
      trip_id: trip.id,
      mileage: finalMileage,
      source: 'TRIP',
      observations: 'Quilometragem final registrada pelo motorista.',
      created_by: userId,
      municipality_id: driver.municipality_id,
    });
    mileageWriteError = error;
  }

  if (mileageWriteError) {
    return NextResponse.json({ error: 'Viagem concluída, mas falhou o registro de quilometragem. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }

  const { error: passengerUpdateError } = await admin.from('trip_passengers').update({ boarding_status: 'NO_SHOW' }).eq('trip_id', trip.id).eq('boarding_status', 'EXPECTED');
  if (passengerUpdateError) {
    return NextResponse.json({ error: 'Viagem concluída, mas falhou a atualização dos passageiros. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }

  const { data: passengers, error: passengersReadError } = await admin
    .from('trip_passengers')
    .select('request_id,boarding_status')
    .eq('trip_id', trip.id)
    .not('request_id', 'is', null);

  if (passengersReadError) {
    return NextResponse.json({ error: 'Viagem concluída, mas falhou a consulta dos passageiros vinculados às solicitações. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }

  const completedIds = [...new Set((passengers ?? []).filter(row => row.boarding_status === 'BOARDED').map(row => row.request_id).filter(Boolean))];
  const noShowIds = [...new Set((passengers ?? []).filter(row => row.boarding_status !== 'BOARDED').map(row => row.request_id).filter(Boolean))];
  if (completedIds.length > 0) {
    const { error } = await admin.from('transport_requests').update({ status: 'COMPLETED' }).in('id', completedIds);
    if (error) return NextResponse.json({ error: 'Viagem concluída, mas falhou a atualização das solicitações atendidas. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }
  if (noShowIds.length > 0) {
    const { error } = await admin.from('transport_requests').update({ status: 'NO_SHOW' }).in('id', noShowIds);
    if (error) return NextResponse.json({ error: 'Viagem concluída, mas falhou a atualização das solicitações de não comparecimento. Avise a gestão; não finalize novamente.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'COMPLETED', finalMileage, distance: finalMileage - initialMileage });
}
