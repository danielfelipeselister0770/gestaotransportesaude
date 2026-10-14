'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type HistoryTrip = {
  id: string;
  date: string;
  departure_time: string;
  origin: string;
  destination: string;
  initial_mileage: number | null;
  final_mileage: number | null;
  vehicle: { plate: string } | null;
};

const supabase = createClient();
const PAGE_SIZE = 10;

export default function DriverTripHistoryPage() {
  const [trips, setTrips] = useState<HistoryTrip[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('Não foi possível confirmar sua sessão.');
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('role,active,municipality_id').eq('id', auth.user.id).single();
        if (profileError || !profile?.active || profile.role !== 'MOTORISTA' || !profile.municipality_id) {
          throw new Error('Acesso permitido somente a motoristas ativos.');
        }
        const { data: driver, error: driverError } = await supabase.from('drivers')
          .select('id').eq('profile_id', auth.user.id).eq('municipality_id', profile.municipality_id)
          .eq('active', true).maybeSingle();
        if (driverError || !driver) throw new Error('Cadastro de motorista ativo não encontrado.');
        const { data, error: tripError, count } = await supabase.from('trips')
          .select('id,date,departure_time,origin,destination,initial_mileage,final_mileage,vehicle:vehicles(plate)', { count: 'exact' })
          .eq('municipality_id', profile.municipality_id)
          .eq('driver_id', driver.id)
          .eq('status', 'COMPLETED')
          .order('date', { ascending: false })
          .order('departure_time', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
        if (tripError) throw new Error(tripError.message);
        if (!active) return;
        setTrips((data ?? []).map(t => ({
          ...t,
          vehicle: Array.isArray(t.vehicle) ? t.vehicle[0] ?? null : t.vehicle,
        })) as HistoryTrip[]);
        setTotal(count ?? 0);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Não foi possível consultar o histórico.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [page]);

  return (
    <main className="min-h-screen bg-[#f4f7f9] p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/motorista" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">
          ← Voltar à minha programação
        </Link>
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Meu histórico de viagens</h1>
          <p className="mt-1 text-sm text-slate-600">Consulte suas viagens concluídas, das mais recentes às mais antigas.</p>
        </header>
        {loading ? <p role="status" className="rounded-xl bg-white p-5 text-sm">Carregando histórico...</p> :
          error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</div> :
          trips.length === 0 ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Nenhuma viagem concluída encontrada.</p> :
          <div className="space-y-3">
            {trips.map(trip => {
              const initial = trip.initial_mileage == null ? null : Number(trip.initial_mileage);
              const final = trip.final_mileage == null ? null : Number(trip.final_mileage);
              const distance = initial !== null && final !== null && final >= initial ? final - initial : null;
              return (
                <article key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{new Date(trip.date + 'T12:00:00').toLocaleDateString('pt-BR')} • {trip.departure_time}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Concluída</span>
                  </div>
                  <p className="mt-3 text-sm"><strong>Origem:</strong> {trip.origin}</p>
                  <p className="mt-1 text-sm"><strong>Destino:</strong> {trip.destination}</p>
                  <p className="mt-3 text-sm text-slate-600">Veículo: {trip.vehicle?.plate ?? 'Não informado'}</p>
                  <p className="mt-1 text-sm text-slate-600">KM inicial: {initial ?? '—'} • KM final: {final ?? '—'} • Percorrido: {distance === null ? '—' : distance + ' km'}</p>
                </article>
              );
            })}
          </div>}
        {!loading && !error && total > PAGE_SIZE && (
          <nav aria-label="Páginas do histórico" className="flex items-center justify-between gap-3">
            <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-40">Anterior</button>
            <span className="text-sm text-slate-600">Página {page} de {Math.ceil(total / PAGE_SIZE)} • {total} viagens</span>
            <button type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-40">Próxima</button>
          </nav>
        )}
      </div>
    </main>
  );
}
