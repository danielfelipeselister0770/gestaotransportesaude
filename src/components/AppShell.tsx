'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Siren, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

const mobileLinks = [["Dashboard", "/"], ["Pacientes", "/pacientes"], ["Solicitações", "/solicitacoes"], ["Agenda / Viagens", "/viagens"], ["Veículos", "/veiculos"], ["Motoristas", "/motoristas"], ["Estabelecimentos", "/estabelecimentos"], ["Profissionais SUS", "/profissionais"], ["Abastecimentos", "/abastecimentos"], ["Manutenções", "/manutencoes"], ["Ocorrências", "/ocorrencias"], ["Produção SUS", "/producao"], ["Relatórios", "/relatorios"], ["Configurações", "/configuracoes"]] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    firstLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const isPublic = pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/motorista/');
  if (isPublic) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <Sidebar />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white"><Siren size={18}/></span>Transporte Saúde</Link>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
      </header>
      {menuOpen && <div className="fixed inset-0 top-16 z-40 bg-slate-950/50 md:hidden" onClick={() => setMenuOpen(false)}><div id="mobile-navigation" role="navigation" aria-label="Navegação principal" className="h-full w-72 max-w-[85vw] overflow-y-auto bg-slate-900 p-4 shadow-xl" onClick={(event) => event.stopPropagation()}><nav className="flex flex-col gap-1 text-sm">{mobileLinks.map(([label, href]) => <Link key={href} ref={href === "/" ? firstLinkRef : undefined} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ? "page" : undefined} className={`rounded-xl px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ? "bg-white font-semibold text-slate-950" : "text-slate-200 hover:bg-white/10"}`}>{label}</Link>)}</nav></div></div>}
      <main className="md:ml-72"><div className="app-content">{children}</div></main>
    </div>
  );
}
