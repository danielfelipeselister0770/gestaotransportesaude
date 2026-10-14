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
    .select('id,role,municipality_id,active')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || profile.role !== 'MOTORISTA' || !profile.active || !profile.municipality_id) {
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
    .select('id,municipality_id,active')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!driver || !driver.active || driver.municipality_id !== profile.municipality_id) {
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

  // Não concluir uma viagem com embarques ainda sem decisão.
  const { data: boardingRows, error: boardingReadError } = await admin
    .from('trip_passengers')
    .select('id,boarding_status,request_id')
    .eq('trip_id', trip.id);
  if (boardingReadError) {
    return NextResponse.json({ error: 'Não foi possível conferir os embarques. A viagem permanece em andamento.' }, { status: 500 });
  }
  if ((boardingRows ?? []).some(row => !['BOARDED', 'NO_SHOW'].includes(row.boarding_status))) {
    return NextResponse.json({ error: 'Registre Embarcou ou Não embarcou para todos os passageiros antes de finalizar.' }, { status: 409 });
  }
  // A solicitação pode já ter sido sincronizada durante o embarque.
  // A função transacional valida o status final esperado para cada solicitação,
  // sob bloqueio no banco, evitando rejeitar uma ausência já registrada.

  const { data: result, error: finishError } = await admin.rpc('finish_driver_trip_atomic', {
    p_trip_id: trip.id,
    p_driver_user_id: userId,
    p_final_mileage: finalMileage,
  });
  if (finishError || !result) {
    console.error('Falha na finalização transacional da viagem', {
      tripId: trip.id,
      code: finishError?.code ?? null,
      message: finishError?.message ?? null,
    });
    return NextResponse.json({
      error: 'Não foi possível concluir a viagem. Nenhuma alteração da finalização foi confirmada. Atualize a programação e, se persistir, avise a gestão.',
      errorCode: finishError?.code ?? 'FINISH_FAILED',
    }, { status: 409 });
  }
  return NextResponse.json(result);
}
