import { AlertTriangle, CarFront, ClipboardList, Gauge, LogOut, MapPinned, Users, Wrench, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  MOTORISTA: 'Motorista',
};

export default async function Home() {
  const supabase = createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [{ data: profile }, trips, passengers, requests, vehicles, maintenances, occurrences, upcomingTripsResult, todayRequests, vehicleTotal, maintenanceVehicles, documentAlerts] = await Promise.all([
    userId ? supabase.from('profiles').select('name, role').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('trips').select('id', { count: 'exact', head: true }).eq('date', today),
    supabase
      .from('trip_passengers')
      .select('id, trips!inner(status)', { count: 'exact', head: true })
      .in('trips.status', ['SCHEDULED', 'IN_PROGRESS']),
    supabase.from('transport_requests').select('id', { count: 'exact', head: true }).in('status', ['REQUESTED', 'APPROVED']),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE'),
    supabase.from('maintenances').select('id', { count: 'exact', head: true }).in('status', ['SCHEDULED', 'IN_PROGRESS']),
    supabase.from('occurrences').select('id', { count: 'exact', head: true }).in('status', ['OPEN', 'IN_REVIEW']),
    supabase
      .from('trips')
      .select('id, date, departure_time, origin, destination, status, driver:drivers(name), vehicle:vehicles(plate)')
      .gte('date', today)
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .order('date', { ascending: true })
      .order('departure_time', { ascending: true })
      .limit(6),
    supabase.from('transport_requests').select('id,status').eq('date',today),
    supabase.from('vehicles').select('id',{count:'exact',head:true}),
    supabase.from('vehicles').select('id',{count:'exact',head:true}).eq('status','MAINTENANCE'),
    supabase.from('vehicles').select('id,plate,licensing_expiry,insurance_expiry').or(`licensing_expiry.lte.${new Date(Date.now()+30*86400000).toISOString().slice(0,10)},insurance_expiry.lte.${new Date(Date.now()+30*86400000).toISOString().slice(0,10)}`).limit(6),
  ]);

  type UpcomingTrip = {
    id: string;
    date: string;
    departure_time: string | null;
    origin: string;
    destination: string;
    status: string;
    driver: { name: string } | null;
    vehicle: { plate: string } | null;
  };

  const upcomingTrips = (upcomingTripsResult.data ?? []).map((row) => ({
    ...row,
    driver: Array.isArray(row.driver) ? row.driver[0] ?? null : row.driver,
    vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : row.vehicle,
  })) as UpcomingTrip[];

  const requestRows=(todayRequests.data??[]) as {id:string;status:string}[];
  const todayPending=requestRows.filter(r=>['REQUESTED','APPROVED'].includes(r.status)).length;
  const fleetUnavailable=Math.max(0,(vehicleTotal.count??0)-(vehicles.count??0));
  const alerts=[...(occurrences.count??0)>0?[`${occurrences.count} ocorrência(s) aguardando acompanhamento.`]:[],...(maintenances.count??0)>0?[`${maintenances.count} manutenção(ões) programada(s) ou em andamento.`]:[],...((documentAlerts.data??[]) as {plate:string;licensing_expiry:string|null;insurance_expiry:string|null}[]).map(v=>`Veículo ${v.plate} possui documento vencido ou vencendo nos próximos 30 dias.`)];

  const cards: Array<[string, number, LucideIcon, string]> = [
    ['Viagens hoje', trips.count ?? 0, CarFront, '/viagens'],
    ['Passageiros em viagens', passengers.count ?? 0, Users, '/viagens'],
    ['Solicitações pendentes', requests.count ?? 0, ClipboardList, '/solicitacoes'],
    ['Veículos disponíveis', vehicles.count ?? 0, CarFront, '/veiculos'],
    ['Manutenções abertas', maintenances.count ?? 0, Wrench, '/manutencoes'],
    ['Ocorrências abertas', occurrences.count ?? 0, Gauge, '/ocorrencias'],
  ];

  const displayName = profile?.name || (claimsData?.claims?.email as string | undefined) || 'Usuário';
  const roleLabel = profile?.role ? roleLabels[profile.role] ?? profile.role : 'Usuário autorizado';

  return (
    <main className="min-h-screen bg-slate-50">
<section className="">
        <header className="flex items-center justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><MapPinned size={16} /> Gestão municipal de transporte em saúde</div>
            <h1 className="mt-1 text-2xl font-bold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{displayName}</div>
              <div className="text-xs text-slate-500">{roleLabel}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" title="Sair" className="rounded-lg border p-2 text-slate-600 transition hover:bg-slate-50"><LogOut size={18} /></button>
            </form>
          </div>
        </header>

        <div className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(([label, value, Icon, href]) => (
              <Link href={href} key={label as string} className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label as string}</span><Icon size={20} className="text-slate-500" /></div>
                <div className="mt-3 text-3xl font-bold">{value as number}</div>
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Pendências de hoje</div><div className="mt-2 text-2xl font-bold">{todayPending}</div><div className="mt-1 text-xs text-slate-500">Solicitações de hoje ainda aguardando fluxo.</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Frota indisponível</div><div className="mt-2 text-2xl font-bold">{fleetUnavailable}</div><div className="mt-1 text-xs text-slate-500">{maintenanceVehicles.count??0} veículo(s) marcado(s) em manutenção.</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Alertas operacionais</div><div className="mt-2 text-2xl font-bold">{alerts.length}</div><div className="mt-1 text-xs text-slate-500">Ocorrências, manutenção e documentos da frota.</div></div>
          </div>

          {alerts.length>0&&<div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={18}/> Atenção da gestão</div><div className="mt-3 space-y-2">{alerts.slice(0,6).map((a,i)=><div key={i} className="text-sm text-amber-900">• {a}</div>)}</div></div>}

          <div className="mt-6 rounded-xl border bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Próximas viagens</h2>
                <p className="mt-1 text-sm text-slate-500">Viagens agendadas ou em andamento a partir de hoje.</p>
              </div>
              <Link href="/viagens" className="text-sm font-medium text-slate-700 hover:underline">Ver agenda</Link>
            </div>

            {upcomingTrips.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
                Nenhuma viagem agendada para os próximos dias.
              </div>
            ) : (
              <div className="mt-5 divide-y">
                {upcomingTrips.map((trip) => (
                  <Link key={trip.id} href={`/viagens/${trip.id}`} className="flex flex-col gap-2 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{trip.date.split('-').reverse().join('/')}</span>
                        {trip.departure_time && <span className="text-sm text-slate-500">{trip.departure_time.slice(0, 5)}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${trip.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                          {trip.status === 'IN_PROGRESS' ? 'Em andamento' : 'Agendada'}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{trip.origin} → {trip.destination}</div>
                    </div>
                    <div className="text-left text-xs text-slate-500 sm:text-right">
                      <div>{trip.driver?.name ?? 'Motorista não informado'}</div>
                      <div>{trip.vehicle?.plate ?? 'Veículo não informado'}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Link href="/solicitacoes" className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow">
              <ClipboardList size={20} className="text-slate-500" />
              <h3 className="mt-3 font-semibold">Solicitações</h3>
              <p className="mt-1 text-sm text-slate-500">Aprovar e acompanhar pedidos de transporte.</p>
            </Link>
            <Link href="/viagens" className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow">
              <CarFront size={20} className="text-slate-500" />
              <h3 className="mt-3 font-semibold">Agenda / Viagens</h3>
              <p className="mt-1 text-sm text-slate-500">Montar viagens, iniciar e acompanhar atendimentos.</p>
            </Link>
            <Link href="/relatorios" className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow">
              <Gauge size={20} className="text-slate-500" />
              <h3 className="mt-3 font-semibold">Relatórios</h3>
              <p className="mt-1 text-sm text-slate-500">Consultar indicadores e exportar dados para Excel.</p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
