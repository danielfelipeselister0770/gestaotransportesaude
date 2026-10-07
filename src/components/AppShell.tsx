'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Siren } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/motorista/');
  if (isPublic) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <Sidebar />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white"><Siren size={18}/></span>Transporte Saúde</Link>
        <Link href="/configuracoes" aria-label="Abrir configurações" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700"><Menu size={20}/></Link>
      </header>
      <main className="md:ml-72"><div className="app-content">{children}</div></main>
    </div>
  );
}
