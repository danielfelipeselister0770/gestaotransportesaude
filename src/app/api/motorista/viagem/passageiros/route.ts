import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const server = createServerClient();
  const { data: claims } = await server.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!tripId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(tripId)) {
    return NextResponse.json({ error: 'Viagem inválida.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Configuração segura ausente.' }, { status: 500 });
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile } = await admin.from('profiles').select('role,active,municipality_id').eq('id', userId).maybeSingle();
  if (!profile || profile.role !== 'MOTORISTA' || !profile.active) {
    return NextResponse.json({ error: 'Acesso restrito ao motorista ativo.' }, { status: 403 });
  }
  const { data: driver } = await admin.from('drivers').select('id,municipality_id').eq('profile_id', userId).maybeSingle();
  const { data: trip } = await admin.from('trips').select('id,driver_id,municipality_id').eq('id', tripId).maybeSingle();
  if (!driver || !trip || trip.driver_id !== driver.id || trip.municipality_id !== driver.municipality_id || trip.municipality_id !== profile.municipality_id) {
    return NextResponse.json({ error: 'Viagem não atribuída a este motorista.' }, { status: 403 });
  }

  const { data: passengers, error } = await admin.from('trip_passengers')
    .select('id,patient_id,boarding_status,boarding_reason,boarding_recorded_at,companion,observations')
    .eq('trip_id', tripId);
  if (error) return NextResponse.json({ error: 'Não foi possível consultar os passageiros.' }, { status: 500 });
  const patientIds = [...new Set((passengers ?? []).map(p => p.patient_id).filter((id): id is string => Boolean(id)))];
  const { data: patients, error: patientError } = patientIds.length
    ? await admin.from('patients').select('id,name').in('id', patientIds).eq('municipality_id', driver.municipality_id)
    : { data: [], error: null };
  if (patientError) return NextResponse.json({ error: 'Não foi possível identificar os pacientes.' }, { status: 500 });
  const names = new Map((patients ?? []).map(p => [p.id, p.name]));
  const result = (passengers ?? []).map(p => ({
    id: p.id, boarding_status: p.boarding_status, boarding_reason: p.boarding_reason,
    boarding_recorded_at: p.boarding_recorded_at, companion: p.companion,
    observations: p.observations, patient: p.patient_id && names.has(p.patient_id) ? { name: names.get(p.patient_id) } : null,
  }));
  return NextResponse.json({ passengers: result }, { headers: { 'Cache-Control': 'no-store' } });
}
