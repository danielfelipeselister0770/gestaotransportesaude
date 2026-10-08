'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Ambulance, Building2, CalendarDays, ClipboardList, FileBarChart, Fuel, Gauge, LayoutDashboard, Settings, Stethoscope, TriangleAlert, UserRound, UsersRound, Wrench } from 'lucide-react';

const nav = [
  ['Dashboard', '/', LayoutDashboard],
  ['Pacientes', '/pacientes', UsersRound],
  ['Solicitações', '/solicitacoes', ClipboardList],
  ['Agenda / Viagens', '/viagens', CalendarDays],
  ['Veículos', '/veiculos', Ambulance],
  ['Motoristas', '/motoristas', UserRound],
  ['Estabelecimentos', '/estabelecimentos', Building2],
  ['Profissionais SUS', '/profissionais', Stethoscope],
  ['Abastecimentos', '/abastecimentos', Fuel],
  ['Manutenções', '/manutencoes', Wrench],
  ['Ocorrências', '/ocorrencias', TriangleAlert],
  ['Produção SUS', '/producao', Activity],
  ['Relatórios', '/relatorios', FileBarChart],
  ['Configurações', '/configuracoes', Settings],
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  if (pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/motorista/')) return null;

  return (
    <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-72 flex-col md:flex">
      <div className="border-b border-white/10 px-6 py-6">
        <Link href="/" aria-label="Transporte Saúde — página inicial" className="flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 shadow-inner"><Gauge size={23}/></span>
          <span><span className="block text-[11px] font-semibold uppercase tracking-[.2em] text-emerald-300">Gestão Municipal</span><span className="mt-0.5 block text-lg font-bold text-white">Transporte Saúde</span></span>
        </Link>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-5 text-sm">
        {nav.map(([label, href, Icon]) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
          return <Link key={label} href={href} aria-current={active ? 'page' : undefined} className={'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ' + (active ? 'bg-white text-slate-950 shadow-sm font-semibold' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
            <Icon size={18} strokeWidth={active ? 2.4 : 1.9}/><span>{label}</span>
          </Link>;
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400"><div className="font-medium text-slate-300">Sistema municipal</div><div className="mt-1">Operação • SUS • Frota</div></div>
    </aside>
  );
}
