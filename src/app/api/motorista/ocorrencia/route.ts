import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const server = createServerClient();
  const { data: claimsData } = await server.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await server.from('profiles').select('id,role,municipality_id').eq('id', userId).maybeSingle();
  if (!profile || profile.role !== 'MOTORISTA') {
    return NextResponse.json({ error: 'Apenas motoristas podem registrar ocorrências.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    tripId?: string; type?: string; description?: string; observations?: string;
  } | null;
  const tripId = body?.tripId?.trim();
  const type = body?.type?.trim();
  const description = body?.description?.trim();
  const observations = body?.observations?.trim() || null;

  if (!tripId || !type || !description) {
    return NextResponse.json({ error: 'Viagem, tipo e descrição são obrigatórios.' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Configuração segura do servidor ausente.' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: driver } = await admin.from('drivers').select('id,municipality_id').eq('profile_id', userId).maybeSingle();
  if (!driver || driver.municipality_id !== profile.municipality_id) {
    return NextResponse.json({ error: 'Motorista não vinculado corretamente.' }, { status: 403 });
  }

  const { data: trip } = await admin.from('trips').select('id,driver_id,vehicle_id,municipality_id,status').eq('id', tripId).maybeSingle();
  if (!trip) return NextResponse.json({ error: 'Viagem não encontrada.' }, { status: 404 });
  if (trip.driver_id !== driver.id || trip.municipality_id !== driver.municipality_id) {
    return NextResponse.json({ error: 'Esta viagem não pertence a você.' }, { status: 403 });
  }
  if (trip.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'A ocorrência só pode ser registrada durante uma viagem em andamento.' }, { status: 409 });
  }

  const { data: occurrence, error } = await admin.from('occurrences').insert({
    vehicle_id: trip.vehicle_id,
    trip_id: trip.id,
    date: new Date().toISOString(),
    type,
    description,
    status: 'OPEN',
    observations,
    municipality_id: driver.municipality_id,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, occurrenceId: occurrence.id });
}
