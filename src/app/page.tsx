import { CarFront, ClipboardList, Gauge, LogOut, MapPinned, Users, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

const cards = [
  ['Viagens hoje', '0', 'CarFront'],
  ['Passageiros hoje', '0', 'Users'],
  ['Solicitações pendentes', '0', 'ClipboardList'],
  ['Veículos disponíveis', '0', 'CarFront'],
  ['Manutenções abertas', '0', 'Wrench'],
  ['Ocorrências abertas', '0', 'Gauge'],
];

const icons = { CarFront, Users, ClipboardList, Wrench, Gauge };

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

  const { data: profile } = userId
    ? await supabase.from('profiles').select('name, role').eq('id', userId).maybeSingle()
    : { data: null };

  const displayName = profile?.name || (claimsData?.claims?.email as string | undefined) || 'Usuário';
  const roleLabel = profile?.role ? roleLabels[profile.role] ?? profile.role : 'Usuário autorizado';

  return (
    <main className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {['Dashboard', 'Pacientes', 'Solicitações', 'Agenda / Viagens', 'Veículos', 'Motoristas', 'Abastecimentos', 'Manutenções', 'Ocorrências', 'Relatórios', 'Configurações'].map((item, index) => (
            <div key={item} className={`rounded-lg px-3 py-2 ${index === 0 ? 'bg-slate-100 font-semibold' : 'text-slate-600'}`}>
              {item}
            </div>
          ))}
        </nav>
      </aside>

      <section className="md:ml-64">
        <header className="flex items-center justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <MapPinned size={16} />
              Gestão municipal de transporte em saúde
            </div>
            <h1 className="mt-1 text-2xl font-bold">Dashboard</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{displayName}</div>
              <div className="text-xs text-slate-500">{roleLabel}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                title="Sair"
                className="rounded-lg border p-2 text-slate-600 transition hover:bg-slate-50"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>

        <div className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(([label, value, icon]) => {
              const Icon = icons[icon as keyof typeof icons];
              return (
                <div key={label} className="rounded-xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{label}</span>
                    <Icon size={20} className="text-slate-500" />
                  </div>
                  <div className="mt-3 text-3xl font-bold">{value}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border bg-white p-6">
            <h2 className="font-semibold">Próximas viagens</h2>
            <p className="mt-2 text-sm text-slate-500">
              A agenda aparecerá aqui quando as primeiras viagens forem cadastradas.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
