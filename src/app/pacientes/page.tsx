'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Patient = {
  id: string;
  name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  city: string | null;
  wheelchair: boolean;
  reduced_mobility: boolean;
  stretcher: boolean;
  needs_companion: boolean;
  active: boolean;
};

export default function PatientsPage() {
  const supabase = createClient();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadPatients() {
    setLoading(true);
    const { data, error } = await supabase
      .from('patients')
      .select('id,name,cpf,birth_date,phone,city,wheelchair,reduced_mobility,stretcher,needs_companion,active')
      .eq('active', true)
      .order('name');
    if (error) setMessage(`Erro ao carregar pacientes: ${error.message}`);
    else setPatients((data ?? []) as Patient[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPatients();
  }, []);

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const form = new FormData(event.currentTarget);

    const { error } = await supabase.from('patients').insert({
      name: String(form.get('name') ?? '').trim(),
      cpf: String(form.get('cpf') ?? '').trim() || null,
      birth_date: String(form.get('birth_date') ?? '') || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      address: String(form.get('address') ?? '').trim() || null,
      city: String(form.get('city') ?? '').trim() || null,
      wheelchair: form.get('wheelchair') === 'on',
      reduced_mobility: form.get('reduced_mobility') === 'on',
      stretcher: form.get('stretcher') === 'on',
      needs_companion: form.get('needs_companion') === 'on',
    });

    if (error) setMessage(`Não foi possível cadastrar: ${error.message}`);
    else {
      event.currentTarget.reset();
      setShowForm(false);
      setMessage('Paciente cadastrado com sucesso.');
      await loadPatients();
    }
    setSaving(false);
  }

  const filtered = patients.filter((patient) =>
    patient.name.toLowerCase().includes(search.toLowerCase()) ||
    (patient.cpf ?? '').includes(search)
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
        <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
        <nav className="space-y-1 text-sm">
          {[
            ['Dashboard', '/'],
            ['Pacientes', '/pacientes'],
            ['Solicitações', '/solicitacoes'],
            ['Agenda / Viagens', '/viagens'],
            ['Veículos', '/veiculos'],
            ['Motoristas', '/motoristas'],
            ['Abastecimentos', '/abastecimentos'],
            ['Manutenções', '/manutencoes'],
            ['Ocorrências', '/ocorrencias'],
            ['Relatórios', '/relatorios'],
            ['Configurações', '/configuracoes'],
          ].map(([label, href]) => (
            <Link key={label} href={href} className={`block rounded-lg px-3 py-2 ${label === 'Pacientes' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>
          ))}
        </nav>
      </aside>

      <section className="md:ml-64">
        <header className="flex items-center justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><UserRound size={16} /> Cadastro e acompanhamento</div>
            <h1 className="mt-1 text-2xl font-bold">Pacientes</h1>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            <Plus size={18} /> Novo paciente
          </button>
        </header>

        <div className="p-6">
          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

          {showForm && (
            <form onSubmit={createPatient} className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="mb-5 font-semibold">Novo paciente</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="name" label="Nome completo" required />
                <Field name="cpf" label="CPF" placeholder="000.000.000-00" />
                <Field name="birth_date" label="Data de nascimento" type="date" />
                <Field name="phone" label="Telefone" />
                <Field name="address" label="Endereço" />
                <Field name="city" label="Cidade" />
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-700">
                <Check name="wheelchair" label="Cadeira de rodas" />
                <Check name="reduced_mobility" label="Mobilidade reduzida" />
                <Check name="stretcher" label="Maca" />
                <Check name="needs_companion" label="Precisa acompanhante" />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Cadastrar paciente'}</button>
              </div>
            </form>
          )}

          <div className="mb-4 flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou CPF..." className="w-full bg-transparent text-sm outline-none" />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase text-slate-500 md:grid">
              <span>Paciente</span><span>CPF</span><span>Telefone</span><span>Necessidades</span>
            </div>
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando pacientes...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum paciente cadastrado.</div> :
              filtered.map((patient) => (
                <div key={patient.id} className="grid gap-2 border-b px-5 py-4 last:border-0 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center md:gap-4">
                  <div><div className="font-medium text-slate-800">{patient.name}</div><div className="text-xs text-slate-500">{patient.city || 'Cidade não informada'}</div></div>
                  <div className="text-sm text-slate-600">{patient.cpf || '—'}</div>
                  <div className="text-sm text-slate-600">{patient.phone || '—'}</div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {patient.wheelchair && <Badge>🚼 Cadeira</Badge>}
                    {patient.reduced_mobility && <Badge>♿ Mobilidade</Badge>}
                    {patient.stretcher && <Badge>🛏️ Maca</Badge>}
                    {patient.needs_companion && <Badge>👥 Acompanhante</Badge>}
                    {!patient.wheelchair && !patient.reduced_mobility && !patient.stretcher && !patient.needs_companion && <span className="text-slate-400">Nenhuma</span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ name, label, type = 'text', placeholder, required }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /></label>;
}

function Check({ name, label }: { name: string; label: string }) {
  return <label className="flex items-center gap-2"><input name={name} type="checkbox" className="h-4 w-4 rounded border-slate-300" />{label}</label>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{children}</span>;
}
