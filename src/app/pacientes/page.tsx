'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  FileUp,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Eye,
  History,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Patient = {
  id: string;
  municipality_id: string | null;
  name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  cns: string | null;
  sex: string | null;
  nationality: string | null;
  race_color: string | null;
  ethnicity: string | null;
  cep: string | null;
  residence_municipality: string | null;
  residence_municipality_ibge: string | null;
  street: string | null;
  street_number: string | null;
  neighborhood: string | null;
  address_complement: string | null;
  wheelchair: boolean;
  reduced_mobility: boolean;
  stretcher: boolean;
  needs_companion: boolean;
  observations: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
};

type Municipality = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type PatientHistory = {
  id: string;
  action: 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'REACTIVATED';
  changed_at: string;
  user_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const patientFields = [
  'id',
  'municipality_id',
  'name',
  'cpf',
  'birth_date',
  'phone',
  'address',
  'city',
  'cns',
  'sex',
  'nationality',
  'race_color',
  'ethnicity',
  'cep',
  'residence_municipality',
  'residence_municipality_ibge',
  'street',
  'street_number',
  'neighborhood',
  'address_complement',
  'wheelchair',
  'reduced_mobility',
  'stretcher',
  'needs_companion',
  'observations',
  'active',
  'created_at',
  'updated_at',
  'deactivated_at',
].join(',');

export default function PatientsPage() {
  const supabase = createClient();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [municipalityFilter, setMunicipalityFilter] = useState('ALL');
  const [needsFilter, setNeedsFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [companionFilter, setCompanionFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<PatientHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  async function loadPatients() {
    setLoading(true);
    const { data, error } = await supabase
      .from('patients')
      .select(patientFields)
      .order('name');

    if (error) {
      setMessage(`Erro ao carregar pacientes: ${error.message}`);
    } else {
      setPatients((data ?? []) as unknown as Patient[]);
    }
    setLoading(false);
  }

  async function loadMunicipalities() {
    const { data } = await supabase
      .from('municipalities')
      .select('id,name,city,state')
      .eq('active', true)
      .order('name');

    setMunicipalities((data ?? []) as unknown as Municipality[]);
  }

  useEffect(() => {
    loadPatients();
    loadMunicipalities();
  }, []);

  async function loadHistory(patient: Patient) {
    setSelectedPatient(patient);
    setLoadingHistory(true);
    setHistory([]);

    const { data, error } = await supabase
      .from('patient_history')
      .select('id,action,changed_at,user_id,old_data,new_data')
      .eq('patient_id', patient.id)
      .order('changed_at', { ascending: false });

    if (error) {
      setMessage(`Não foi possível carregar o histórico: ${error.message}`);
    } else {
      setHistory((data ?? []) as unknown as PatientHistory[]);
    }

    setLoadingHistory(false);
  }

  function openNewPatient() {
    setEditingPatient(null);
    setFormError('');
    setShowForm(true);
  }

  function openEditPatient(patient: Patient) {
    setSelectedPatient(null);
    setEditingPatient(patient);
    setFormError('');
    setShowForm(true);
  }

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setMessage('');

    const form = new FormData(event.currentTarget);
    const cpf = digits(form.get('cpf'));
    const cns = digits(form.get('cns'));
    const cep = digits(form.get('cep'));
    const ibge = digits(form.get('residence_municipality_ibge'));
    const name = String(form.get('name') ?? '').trim();

    if (!name) {
      setFormError('Informe o nome completo do paciente.');
      setSaving(false);
      return;
    }

    if (cpf && !isValidCpf(cpf)) {
      setFormError('CPF inválido. Confira os 11 dígitos informados.');
      setSaving(false);
      return;
    }

    if (cns && !isValidCns(cns)) {
      setFormError('CNS inválido. Informe um CNS válido de 15 dígitos.');
      setSaving(false);
      return;
    }

    if (cep && cep.length !== 8) {
      setFormError('CEP deve conter 8 dígitos.');
      setSaving(false);
      return;
    }

    if (ibge && ibge.length !== 7) {
      setFormError('Código IBGE do município deve conter 7 dígitos.');
      setSaving(false);
      return;
    }

    const patientData = {
      name,
      cpf: cpf || null,
      birth_date: String(form.get('birth_date') ?? '') || null,
      phone: digits(form.get('phone')) || null,
      address: String(form.get('address') ?? '').trim() || null,
      city: String(form.get('city') ?? '').trim() || null,
      cns: cns || null,
      sex: String(form.get('sex') ?? '') || null,
      nationality: String(form.get('nationality') ?? '') || null,
      race_color: String(form.get('race_color') ?? '') || null,
      ethnicity: String(form.get('ethnicity') ?? '').trim() || null,
      cep: cep || null,
      residence_municipality: String(form.get('residence_municipality') ?? '').trim() || null,
      residence_municipality_ibge: ibge || null,
      street: String(form.get('street') ?? '').trim() || null,
      street_number: String(form.get('street_number') ?? '').trim() || null,
      neighborhood: String(form.get('neighborhood') ?? '').trim() || null,
      address_complement: String(form.get('address_complement') ?? '').trim() || null,
      wheelchair: form.get('wheelchair') === 'on',
      reduced_mobility: form.get('reduced_mobility') === 'on',
      stretcher: form.get('stretcher') === 'on',
      needs_companion: form.get('needs_companion') === 'on',
      observations: String(form.get('observations') ?? '').trim() || null,
    };

    try {
      const duplicate = await findDuplicate(cpf, cns, editingPatient?.id);

      if (duplicate) {
        setFormError(
          `Já existe um paciente com o mesmo ${duplicate.field === 'cpf' ? 'CPF' : 'CNS'}: ${duplicate.patient.name}.`
        );
        return;
      }

      if (editingPatient) {
        const { data, error } = await supabase
          .from('patients')
          .update(patientData)
          .eq('id', editingPatient.id)
          .select(patientFields)
          .single();

        if (error) {
          setFormError(formatDatabaseError(error.message));
          return;
        }

        const updated = data as unknown as Patient;
        setPatients((current) => current.map((p) => (p.id === updated.id ? updated : p)));
        setEditingPatient(null);
        setShowForm(false);
        setSelectedPatient(updated);
        await loadHistory(updated);
        setMessage('Paciente atualizado com sucesso.');
      } else {
        const { data, error } = await supabase
          .from('patients')
          .insert(patientData)
          .select(patientFields)
          .single();

        if (error) {
          setFormError(formatDatabaseError(error.message));
          return;
        }

        const created = data as unknown as Patient;
        setPatients((current) =>
          [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        );
        setShowForm(false);
        setMessage('Paciente cadastrado com sucesso.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function findDuplicate(cpf: string, cns: string, currentId?: string) {
    if (cpf) {
      let query = supabase.from('patients').select('id,name').eq('cpf', cpf).limit(1);
      if (currentId) query = query.neq('id', currentId);
      const { data } = await query;
      if (data?.[0]) return { field: 'cpf' as const, patient: data[0] };
    }

    if (cns) {
      let query = supabase.from('patients').select('id,name').eq('cns', cns).limit(1);
      if (currentId) query = query.neq('id', currentId);
      const { data } = await query;
      if (data?.[0]) return { field: 'cns' as const, patient: data[0] };
    }

    return null;
  }

  async function toggleActive(patient: Patient) {
    const nextActive = !patient.active;
    const action = nextActive ? 'reativar' : 'inativar';
    if (!window.confirm(`Deseja ${action} o paciente "${patient.name}"?`)) return;

    setMessage('');
    const { data, error } = await supabase
      .from('patients')
      .update({
        active: nextActive,
        deactivated_at: nextActive ? null : new Date().toISOString(),
      })
      .eq('id', patient.id)
      .select(patientFields)
      .single();

    if (error) {
      setMessage(`Não foi possível ${action} o paciente: ${formatDatabaseError(error.message)}`);
      return;
    }

    const updated = data as unknown as Patient;
    setPatients((current) => current.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPatient(updated);
    await loadHistory(updated);
    setMessage(nextActive ? 'Paciente reativado com sucesso.' : 'Paciente inativado com sucesso.');
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const numericTerm = digits(search);

    return patients.filter((patient) => {
      const matchesSearch =
        !term ||
        patient.name.toLowerCase().includes(term) ||
        (patient.cpf ?? '').includes(numericTerm) ||
        (patient.cns ?? '').includes(numericTerm) ||
        (patient.phone ?? '').includes(numericTerm);

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && patient.active) ||
        (statusFilter === 'INACTIVE' && !patient.active);

      const matchesMunicipality =
        municipalityFilter === 'ALL' || patient.municipality_id === municipalityFilter;

      const hasNeeds = patient.wheelchair || patient.reduced_mobility || patient.stretcher;
      const matchesNeeds =
        needsFilter === 'ALL' ||
        (needsFilter === 'YES' && hasNeeds) ||
        (needsFilter === 'NO' && !hasNeeds);

      const matchesCompanion =
        companionFilter === 'ALL' ||
        (companionFilter === 'YES' && patient.needs_companion) ||
        (companionFilter === 'NO' && !patient.needs_companion);

      return matchesSearch && matchesStatus && matchesMunicipality && matchesNeeds && matchesCompanion;
    });
  }, [patients, search, statusFilter, municipalityFilter, needsFilter, companionFilter]);

  const indicators = useMemo(() => ({
    total: patients.length,
    active: patients.filter((p) => p.active).length,
    cns: patients.filter((p) => Boolean(p.cns)).length,
    cpf: patients.filter((p) => Boolean(p.cpf)).length,
    incomplete: patients.filter((p) => susMissingFields(p).length > 0).length,
  }), [patients]);

  const municipalityName = (id: string | null) =>
    municipalities.find((m) => m.id === id)?.name ?? 'Prefeitura não identificada';

  return (
    <main className="min-h-screen">
      <section>
        <header className="flex flex-col gap-4 border-b border-slate-200/80 bg-white px-5 py-5 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><UserRound size={15} /> Cadastro e acompanhamento</div>\n            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Pacientes</h1>
            <p className="mt-1 text-sm text-slate-500">Cadastro completo, documentos SUS, necessidades de transporte e histórico.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/pacientes/importar" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700"><FileUp size={17}/> Importar arquivo</Link><button onClick={openNewPatient} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
            <Plus size={18} /> Novo paciente
          </button></div>
        </header>

        <div className="p-5 lg:p-8">
          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Indicator icon={<ClipboardList size={18} />} label="Total de pacientes" value={indicators.total} />
            <Indicator icon={<CheckCircle2 size={18} />} label="Pacientes ativos" value={indicators.active} />
            <Indicator icon={<UserRound size={18} />} label="Com CNS" value={indicators.cns} />
            <Indicator icon={<ClipboardList size={18} />} label="Com CPF" value={indicators.cpf} />
            <Indicator icon={<Archive size={18} />} label="Cadastro incompleto" value={indicators.incomplete} />
          </div>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Search size={17} /> Busca e filtros</div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <label className="lg:col-span-2">
                <span className="sr-only">Buscar paciente</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, CPF, CNS ou telefone..."
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <SelectFilter value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)} options={[['ACTIVE','Ativos'],['INACTIVE','Inativos'],['ALL','Todos']]} />
              <SelectFilter value={municipalityFilter} onChange={setMunicipalityFilter} options={[['ALL','Todos os municípios'], ...municipalities.map((m) => [m.id, m.name] as [string,string])]} />
              <SelectFilter value={needsFilter} onChange={(v) => setNeedsFilter(v as typeof needsFilter)} options={[['ALL','Necessidades: todas'],['YES','Com necessidades'],['NO','Sem necessidades']]} />
              <SelectFilter value={companionFilter} onChange={(v) => setCompanionFilter(v as typeof companionFilter)} options={[['ALL','Acompanhante: todos'],['YES','Precisa acompanhante'],['NO','Não precisa']]} />
            </div>
          </div>

          {showForm && (
            <PatientForm
              patient={editingPatient}
              saving={saving}
              error={formError}
              onSubmit={savePatient}
              onCancel={() => { setShowForm(false); setEditingPatient(null); setFormError(''); }}
            />
          )}

          <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>{filtered.length} paciente(s) encontrado(s)</span>
            <span>Busca aplicada sobre os registros permitidos pelo seu acesso.</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_180px] gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 lg:grid">
              <span>Paciente</span><span>CPF</span><span>CNS</span><span>Telefone</span><span>Ações</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Carregando pacientes...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Nenhum paciente encontrado com os filtros atuais.</div>
            ) : (
              filtered.map((patient) => (
                <div key={patient.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 transition last:border-0 hover:bg-slate-50/70 lg:grid-cols-[2fr_1fr_1fr_1fr_180px] lg:items-center lg:gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{patient.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${patient.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {patient.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{patient.city || patient.residence_municipality || 'Município não informado'}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      {patient.wheelchair && <Badge>Cadeira de rodas</Badge>}
                      {patient.reduced_mobility && <Badge>Mobilidade reduzida</Badge>}
                      {patient.stretcher && <Badge>Maca</Badge>}
                      {patient.needs_companion && <Badge>Acompanhante</Badge>}
                      {susMissingFields(patient).length > 0 && <Badge tone="warning">Cadastro incompleto</Badge>}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">{formatCpf(patient.cpf) || '—'}</div>
                  <div className="text-sm text-slate-600">{formatCns(patient.cns) || '—'}</div>
                  <div className="text-sm text-slate-600">{formatPhone(patient.phone) || '—'}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <ActionButton title="Visualizar ficha" onClick={() => loadHistory(patient)}><Eye size={15} /></ActionButton>
                    <ActionButton title="Editar paciente" onClick={() => openEditPatient(patient)}><Edit3 size={15} /></ActionButton>
                    <ActionButton title="Histórico" onClick={() => loadHistory(patient)}><History size={15} /></ActionButton>
                    <ActionButton title={patient.active ? 'Inativar' : 'Reativar'} onClick={() => toggleActive(patient)}>
                      {patient.active ? <Archive size={15} /> : <RotateCcw size={15} />}
                    </ActionButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {selectedPatient && (
        <PatientDetail
          patient={selectedPatient}
          history={history}
          loadingHistory={loadingHistory}
          municipalityName={municipalityName(selectedPatient.municipality_id)}
          onClose={() => setSelectedPatient(null)}
          onEdit={() => openEditPatient(selectedPatient)}
          onToggleActive={() => toggleActive(selectedPatient)}
        />
      )}
    </main>
  );
}

function PatientForm({
  patient,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  patient: Patient | null;
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const value = (key: keyof Patient) => {
    const current = patient?.[key as keyof Patient];
    return current == null ? '' : String(current);
  };

  return (
    <form key={patient?.id ?? 'new'} onSubmit={onSubmit} className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{patient ? 'Editar paciente' : 'Novo paciente'}</h2>
          <p className="mt-1 text-xs text-slate-500">CPF e CNS são armazenados somente com números.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="Nome completo" defaultValue={value('name')} required />
        <Field name="cpf" label="CPF" defaultValue={value('cpf')} placeholder="000.000.000-00" />
        <Field name="birth_date" label="Data de nascimento" type="date" defaultValue={value('birth_date')} />
        <Field name="phone" label="Telefone" defaultValue={value('phone')} placeholder="(00) 00000-0000" />
        <Field name="address" label="Endereço (legado/operacional)" defaultValue={value('address')} />
        <Field name="city" label="Cidade (cadastro operacional)" defaultValue={value('city')} />
      </div>

      <div className="mt-6 border-t pt-5">
        <h3 className="mb-1 font-semibold text-slate-800">Dados cadastrais SUS</h3>
        <p className="mb-4 text-xs text-slate-500">Esses campos ajudam a preparar o cadastro para produção e integrações futuras.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="cns" label="CNS (15 dígitos)" defaultValue={value('cns')} placeholder="Somente números" />
          <SelectField name="sex" label="Sexo" defaultValue={value('sex')} options={[['','Selecione'],['MASCULINO','Masculino'],['FEMININO','Feminino'],['IGNORADO','Ignorado']]} />
          <SelectField name="nationality" label="Nacionalidade" defaultValue={value('nationality')} options={[['','Selecione'],['BRASILEIRA','Brasileira'],['NATURALIZADA','Brasileira naturalizada'],['ESTRANGEIRA','Estrangeira']]} />
          <SelectField name="race_color" label="Raça/cor" defaultValue={value('race_color')} options={[['','Selecione'],['BRANCA','Branca'],['PRETA','Preta'],['PARDA','Parda'],['AMARELA','Amarela'],['INDIGENA','Indígena'],['SEM_DECLARACAO','Sem declaração']]} />
          <Field name="ethnicity" label="Etnia (quando aplicável)" defaultValue={value('ethnicity')} />
          <Field name="cep" label="CEP" defaultValue={value('cep')} placeholder="00000000" />
          <Field name="residence_municipality" label="Município de residência" defaultValue={value('residence_municipality')} />
          <Field name="residence_municipality_ibge" label="Código IBGE do município (7 dígitos)" defaultValue={value('residence_municipality_ibge')} />
          <Field name="street" label="Logradouro" defaultValue={value('street')} />
          <Field name="street_number" label="Número" defaultValue={value('street_number')} />
          <Field name="neighborhood" label="Bairro" defaultValue={value('neighborhood')} />
          <Field name="address_complement" label="Complemento" defaultValue={value('address_complement')} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-700">
        <Check name="wheelchair" label="Cadeira de rodas" defaultChecked={patient?.wheelchair ?? false} />
        <Check name="reduced_mobility" label="Mobilidade reduzida" defaultChecked={patient?.reduced_mobility ?? false} />
        <Check name="stretcher" label="Maca" defaultChecked={patient?.stretcher ?? false} />
        <Check name="needs_companion" label="Precisa acompanhante" defaultChecked={patient?.needs_companion ?? false} />
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span>
        <textarea name="observations" defaultValue={value('observations')} rows={3} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
        <button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60">
          {saving ? 'Salvando...' : patient ? 'Salvar alterações' : 'Cadastrar paciente'}
        </button>
      </div>
    </form>
  );
}

function PatientDetail({
  patient,
  history,
  loadingHistory,
  municipalityName,
  onClose,
  onEdit,
  onToggleActive,
}: {
  patient: Patient;
  history: PatientHistory[];
  loadingHistory: boolean;
  municipalityName: string;
  onClose: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{patient.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${patient.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {patient.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{municipalityName} · Atualizado em {formatDateTime(patient.updated_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <DetailSection title="Identificação">
              <DetailItem label="CPF" value={formatCpf(patient.cpf) || 'Não informado'} />
              <DetailItem label="CNS" value={formatCns(patient.cns) || 'Não informado'} />
              <DetailItem label="Data de nascimento" value={formatDate(patient.birth_date)} />
              <DetailItem label="Sexo" value={labelValue(patient.sex)} />
              <DetailItem label="Nacionalidade" value={labelValue(patient.nationality)} />
              <DetailItem label="Raça/cor" value={labelValue(patient.race_color)} />
              <DetailItem label="Etnia" value={patient.ethnicity || 'Não informada'} />
            </DetailSection>

            <DetailSection title="Contato e endereço">
              <DetailItem label="Telefone" value={formatPhone(patient.phone) || 'Não informado'} />
              <DetailItem label="Cidade" value={patient.city || 'Não informada'} />
              <DetailItem label="Município de residência" value={patient.residence_municipality || 'Não informado'} />
              <DetailItem label="IBGE" value={patient.residence_municipality_ibge || 'Não informado'} />
              <DetailItem label="CEP" value={patient.cep || 'Não informado'} />
              <DetailItem label="Logradouro" value={patient.street || patient.address || 'Não informado'} />
              <DetailItem label="Número" value={patient.street_number || 'Não informado'} />
              <DetailItem label="Bairro" value={patient.neighborhood || 'Não informado'} />
              <DetailItem label="Complemento" value={patient.address_complement || 'Não informado'} />
            </DetailSection>

            <DetailSection title="Transporte e necessidades">
              <DetailItem label="Cadeira de rodas" value={patient.wheelchair ? 'Sim' : 'Não'} />
              <DetailItem label="Mobilidade reduzida" value={patient.reduced_mobility ? 'Sim' : 'Não'} />
              <DetailItem label="Maca" value={patient.stretcher ? 'Sim' : 'Não'} />
              <DetailItem label="Precisa acompanhante" value={patient.needs_companion ? 'Sim' : 'Não'} />
              <div className="md:col-span-2">
                <DetailItem label="Observações" value={patient.observations || 'Nenhuma'} />
              </div>
            </DetailSection>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-800">Cadastro SUS</div>
              {susMissingFields(patient).length === 0 ? (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Cadastro básico completo.</div>
              ) : (
                <>
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Existem dados pendentes.</div>
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">{susMissingFields(patient).map((item) => <li key={item}>• {item}</li>)}</ul>
                </>
              )}
            </div>

            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><History size={16} /> Histórico</div>
              {loadingHistory ? (
                <div className="text-sm text-slate-500">Carregando histórico...</div>
              ) : history.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhuma movimentação registrada.</div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="text-sm font-medium text-slate-800">{historyLabel(entry.action)}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(entry.changed_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-6 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Fechar</button>
          <button onClick={onToggleActive} className="rounded-lg border px-4 py-2 text-sm">
            {patient.active ? 'Inativar paciente' : 'Reativar paciente'}
          </button>
          <button onClick={onEdit} className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"><Edit3 size={15} /> Editar ficha</button>
        </div>
      </div>
    </div>
  );
}

function Indicator({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="mb-3 flex items-center justify-between text-slate-500"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</span><ArrowRight size={15} className="text-slate-300"/></div>\n      <div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="text-sm font-medium text-slate-800">{value}</div></div>;
}

function Field({
  name,
  label,
  type = 'text',
  placeholder,
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue ?? ''} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
    </label>
  );
}

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: [string, string][];
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ''} className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

function SelectFilter({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label className="flex items-center gap-2"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 rounded border-slate-300" />{label}</label>;
}

function ActionButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50">{children}</button>;
}

function Badge({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'warning' }) {
  return <span className={`rounded-full px-2 py-1 ${tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{children}</span>;
}

function digits(value: FormDataEntryValue | string | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(value[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(value[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(value[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(value[10]);
}

function isValidCns(value: string): boolean {
  if (!/^\d{15}$/.test(value) || /^0{15}$/.test(value)) return false;
  return validateCnsStandard(value) || validateCnsProvisional(value);
}

function validateCnsStandard(cns: string): boolean {
  const base = cns.slice(0, 11);
  let sum = 0;
  for (let i = 0; i < 11; i += 1) sum += Number(base[i]) * (15 - i);
  let remainder = sum % 11;
  let digit = 11 - remainder;
  if (digit === 11) digit = 0;
  if (digit === 10) {
    sum += 2;
    remainder = sum % 11;
    digit = 11 - remainder;
  }
  const expected = digit === 10 ? base + '001' + String(digit) : base + '000' + String(digit);
  return cns === expected;
}

function validateCnsProvisional(cns: string): boolean {
  let sum = 0;
  for (let i = 0; i < 15; i += 1) sum += Number(cns[i]) * (15 - i);
  return sum % 11 === 0;
}

function formatCpf(value: string | null): string {
  if (!value) return '';
  const d = digits(value);
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : value;
}

function formatCns(value: string | null): string {
  if (!value) return '';
  const d = digits(value);
  return d.length === 15 ? d.replace(/^(\d{3})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4') : value;
}

function formatPhone(value: string | null): string {
  if (!value) return '';
  const d = digits(value);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return value;
}

function formatDate(value: string | null): string {
  if (!value) return 'Não informada';
  const [year, month, day] = value.split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function labelValue(value: string | null): string {
  return value ? value.replaceAll('_', ' ').toLowerCase().replace(/(^| )\S/g, (letter) => letter.toUpperCase()) : 'Não informado';
}

function historyLabel(action: PatientHistory['action']): string {
  return {
    CREATED: 'Paciente cadastrado',
    UPDATED: 'Cadastro atualizado',
    DEACTIVATED: 'Paciente inativado',
    REACTIVATED: 'Paciente reativado',
  }[action];
}

function formatDatabaseError(message: string): string {
  if (message.includes('patients_municipality_cpf_unique_idx')) return 'Este CPF já está cadastrado para outro paciente.';
  if (message.includes('patients_municipality_cns_unique_idx')) return 'Este CNS já está cadastrado para outro paciente.';
  if (message.includes('patients_cpf_format_check')) return 'CPF inválido.';
  if (message.includes('patients_cns')) return 'CNS inválido.';
  return message;
}

function susMissingFields(patient: Patient): string[] {
  const missing: string[] = [];
  if (!patient.name?.trim()) missing.push('nome');
  if (!patient.birth_date) missing.push('data de nascimento');
  if (!patient.sex) missing.push('sexo');
  if (!patient.nationality) missing.push('nacionalidade');
  if (!patient.race_color) missing.push('raça/cor');
  if (!patient.cep) missing.push('CEP');
  if (!patient.residence_municipality?.trim()) missing.push('município de residência');
  if (!patient.residence_municipality_ibge) missing.push('código IBGE');
  if (!patient.street?.trim()) missing.push('logradouro');
  if (!patient.street_number?.trim()) missing.push('número');
  if (!patient.neighborhood?.trim()) missing.push('bairro');
  if (patient.race_color === 'INDIGENA' && !patient.ethnicity?.trim()) missing.push('etnia');
  return missing;
}
