'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  ['Dashboard', '/'],
  ['Pacientes', '/pacientes'],
  ['Solicitações', '/solicitacoes'],
  ['Agenda / Viagens', '/viagens'],
  ['Veículos', '/veiculos'],
  ['Motoristas', '/motoristas'],
  ['Estabelecimentos de Saúde', '/estabelecimentos'],
  ['Profissionais SUS', '/profissionais'],
  ['Abastecimentos', '/abastecimentos'],
  ['Manutenções', '/manutencoes'],
  ['Ocorrências', '/ocorrencias'],
  ['Produção SUS', '/producao'],
  ['Relatórios', '/relatorios'],
  ['Configurações', '/configuracoes'],
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  if (pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/motorista/')) {
    return null;
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-white p-5 md:block">
      <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
      <nav className="space-y-1 text-sm">
        {nav.map(([label, href]) => (
          <Link
            key={label}
            href={href}
            className={
              'block rounded-lg px-3 py-2 ' +
              (pathname === href
                ? 'bg-slate-100 font-semibold text-slate-900'
                : 'text-slate-600 hover:bg-slate-50')
            }
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
