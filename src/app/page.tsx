import { AlertTriangle, ArrowRight, CalendarClock, CarFront, CheckCircle2, ClipboardList, Gauge, LogOut, MapPinned, Route, Sparkles, Users, Wrench, type LucideIcon } from 'lucide-react';
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

  const cards: Array<[string, number, LucideIcon, string, string]> = [
    ['Viagens hoje', trips.count ?? 0, Route, '/viagens', 'Programadas para hoje'],
    ['Passageiros em viagens', passengers.count ?? 0, Users, '/viagens', 'Em viagens ativas'],
    ['Solicitações pendentes', requests.count ?? 0, ClipboardList, '/solicitacoes', 'Aguardando andamento'],
    ['Veículos disponíveis', vehicles.count ?? 0, CarFront, '/veiculos', 'Prontos para operação'],
    ['Manutenções abertas', maintenances.count ?? 0, Wrench, '/manutencoes', 'Programadas ou ativas'],
    ['Ocorrências abertas', occurrences.count ?? 0, Gauge, '/ocorrencias', 'Precisam de acompanhamento'],
  ];

  const displayName = profile?.name || (claimsData?.claims?.email as string | undefined) || 'Usuário';
  const roleLabel = profile?.role ? roleLabels[profile.role] ?? profile.role : 'Usuário autorizado';

  return (
    <main className="min-h-screen">
      <section>
        <header className="border-b border-slate-200/80 bg-white px-5 py-5 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><MapPinned size={15}/> Central operacional</div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Visão geral do transporte</h1>
              <p className="mt-1 text-sm text-slate-500">Acompanhe a operação do dia, prioridades e próximos deslocamentos.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right sm:block">
                <div className="text-sm font-semibold text-slate-800">{displayName}</div><div className="text-xs text-slate-500">{roleLabel}</div>
              </div>
              <form action="/auth/signout" method="post"><button type="submit" title="Sair" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"><LogOut size={18}/></button></form>
            </div>
          </div>
        </header>

        <div className="space-y-7 p-5 lg:p-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label,value,Icon,href,helper]) => (
              <Link href={href} key={label} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-slate-200/60">
                <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={21}/></div><ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600"/></div>
                <div className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 font-semibold text-slate-700">{label}</div><div className="mt-1 text-xs text-slate-400">{helper}</div>
              </Link>
            ))}
          </div>

          <section>
            <div className="mb-3 flex items-center gap-2"><Sparkles size={17} className="text-teal-700"/><h2 className="font-bold text-slate-900">Prioridades da operação</h2></div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Link href="/solicitacoes" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-200"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Pendências de hoje</span><ClipboardList size={18} className="text-slate-400"/></div><div className="mt-3 text-3xl font-bold text-slate-950">{todayPending}</div><p className="mt-1 text-sm text-slate-500">Solicitações de hoje ainda aguardando fluxo.</p></Link>
              <Link href="/veiculos" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-200"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Frota indisponível</span><Wrench size={18} className="text-slate-400"/></div><div className="mt-3 text-3xl font-bold text-slate-950">{fleetUnavailable}</div><p className="mt-1 text-sm text-slate-500">{maintenanceVehicles.count??0} veículo(s) marcado(s) em manutenção.</p></Link>
              <div className={"rounded-2xl border p-5 "+(alerts.length?"border-amber-200 bg-amber-50/70":"border-emerald-200 bg-emerald-50/60")}><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">Alertas operacionais</span>{alerts.length?<AlertTriangle size={18} className="text-amber-600"/>:<CheckCircle2 size={18} className="text-emerald-600"/>}</div><div className="mt-3 text-3xl font-bold text-slate-950">{alerts.length}</div><p className="mt-1 text-sm text-slate-600">{alerts.length?'Itens que merecem atenção da gestão.':'Operação sem alertas críticos neste momento.'}</p></div>
            </div>
          </section>

          {alerts.length>0&&<section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 lg:p-6"><div className="flex items-center gap-2 font-bold text-amber-950"><AlertTriangle size={19}/> Atenção da gestão</div><div className="mt-4 grid gap-2 md:grid-cols-2">{alerts.slice(0,6).map((a,i)=><div key={i} className="rounded-xl bg-white/70 px-4 py-3 text-sm text-amber-950">{a}</div>)}</div></section>}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 lg:px-6"><div><div className="flex items-center gap-2"><CalendarClock size={18} className="text-teal-700"/><h2 className="font-bold text-slate-900">Próximas viagens</h2></div><p className="mt-1 text-sm text-slate-500">Agenda operacional a partir de hoje.</p></div><Link href="/viagens" className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900">Ver agenda <ArrowRight size={15}/></Link></div>
            {upcomingTrips.length===0?<div className="m-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhuma viagem agendada para os próximos dias.</div>:<div className="divide-y divide-slate-100">{upcomingTrips.map(trip=><Link key={trip.id} href={`/viagens/${trip.id}`} className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between lg:px-6"><div className="flex gap-3"><div className="grid h-11 min-w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><Route size={19}/></div><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{trip.date.split('-').reverse().join('/')}</span>{trip.departure_time&&<span className="text-sm text-slate-500">{trip.departure_time.slice(0,5)}</span>}<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${trip.status==='IN_PROGRESS'?'bg-amber-100 text-amber-800':'bg-teal-50 text-teal-700'}`}>{trip.status==='IN_PROGRESS'?'Em andamento':'Agendada'}</span></div><div className="mt-1 text-sm text-slate-600">{trip.origin} <span className="text-slate-300">→</span> {trip.destination}</div></div></div><div className="text-xs text-slate-500 sm:text-right"><div className="font-medium text-slate-700">{trip.driver?.name??'Motorista não informado'}</div><div className="mt-0.5">{trip.vehicle?.plate??'Veículo não informado'}</div></div></Link>)}</div>}
          </section>

          <section><div className="mb-3"><h2 className="font-bold text-slate-900">Acesso rápido</h2><p className="mt-1 text-sm text-slate-500">Atalhos para as rotinas mais utilizadas.</p></div><div className="grid gap-4 md:grid-cols-3">
            {[[ClipboardList,'Solicitações','Aprovar e acompanhar pedidos de transporte.','/solicitacoes'],[CarFront,'Agenda / Viagens','Montar viagens, iniciar e acompanhar atendimentos.','/viagens'],[Gauge,'Relatórios','Consultar indicadores e custos operacionais.','/relatorios']].map(([Icon,title,desc,href])=>{const I=Icon as LucideIcon;return <Link key={title as string} href={href as string} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-200 hover:shadow-md"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><I size={19}/></span><ArrowRight size={17} className="text-slate-300 group-hover:text-teal-600"/></div><h3 className="mt-4 font-bold text-slate-900">{title as string}</h3><p className="mt-1 text-sm text-slate-500">{desc as string}</p></Link>})}
          </div></section>
        </div>
      </section>
    </main>
  );
}
