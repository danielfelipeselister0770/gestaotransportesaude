'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Search, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';
type Municipality = { id: string; name: string; active: boolean };
type HealthUnit = { id: string; name: string; cnes: string | null; municipality_id: string };
type Professional = {
  id: string; name: string; cns: string | null; cbo: string | null;
  active: boolean; responsible_for_production: boolean;
  municipality_id: string; health_unit_id: string | null;
};

const nav = [
  ['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],
  ['Veículos','/veiculos'],['Motoristas','/motoristas'],['Estabelecimentos de Saúde','/estabelecimentos'],
  ['Profissionais SUS','/profissionais'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],
  ['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes']
];

export default function ProfessionalsPage() {
  const supabase = createClient();
  const [items,setItems]=useState<Professional[]>([]);
  const [units,setUnits]=useState<HealthUnit[]>([]);
  const [municipalities,setMunicipalities]=useState<Municipality[]>([]);
  const [role,setRole]=useState<Role|null>(null);
  const [municipalityId,setMunicipalityId]=useState<string|null>(null);
  const [municipalityName,setMunicipalityName]=useState('');
  const [search,setSearch]=useState('');
  const [editing,setEditing]=useState<Professional|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  async function loadData() {
    setLoading(true);
    const {data: claimsData}=await supabase.auth.getClaims();
    const userId=String(claimsData?.claims?.sub ?? '');
    if(!userId){setMessage('Sessão não encontrada.');setLoading(false);return;}

    const {data:profile,error:profileError}=await supabase.from('profiles').select('role,municipality_id').eq('id',userId).maybeSingle();
    if(profileError||!profile){setMessage(profileError?.message ?? 'Não foi possível identificar o usuário.');setLoading(false);return;}

    const currentRole=profile.role as Role;
    setRole(currentRole); setMunicipalityId(profile.municipality_id);

    if(currentRole==='ADMIN'){
      const {data:ms}=await supabase.from('municipalities').select('id,name,active').eq('active',true).order('name');
      setMunicipalities((ms??[]) as Municipality[]);
      setMunicipalityName('Todas as prefeituras');
    } else if(profile.municipality_id){
      const {data:m}=await supabase.from('municipalities').select('name').eq('id',profile.municipality_id).maybeSingle();
      setMunicipalityName(m?.name ?? 'Minha prefeitura');
    }

    const [p,u]=await Promise.all([
      supabase.from('health_professionals').select('id,name,cns,cbo,active,responsible_for_production,municipality_id,health_unit_id').order('name'),
      supabase.from('health_units').select('id,name,cnes,municipality_id').eq('active',true).order('name')
    ]);
    if(p.error) setMessage('Erro ao carregar profissionais: '+p.error.message);
    else setItems((p.data??[]) as Professional[]);
    if(u.error) setMessage('Erro ao carregar estabelecimentos: '+u.error.message);
    else setUnits((u.data??[]) as HealthUnit[]);
    setLoading(false);
  }

  useEffect(()=>{loadData();},[]);

  const canManage=role==='ADMIN'||role==='GESTOR';

  function openNew(){setEditing(null);setShowForm(true);setMessage('');}
  function openEdit(item:Professional){setEditing(item);setShowForm(true);setMessage('');}

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canManage)return;
    const form=new FormData(event.currentTarget);
    const cns=String(form.get('cns')??'').replace(/\D/g,'');
    const cbo=String(form.get('cbo')??'').replace(/\D/g,'');
    if(cns && cns.length!==15){setMessage('O CNS deve conter 15 dígitos.');return;}
    if(cbo && cbo.length!==6){setMessage('O CBO deve conter 6 dígitos.');return;}

    const selectedMunicipalityId=role==='ADMIN'
      ? String(form.get('municipality_id')??'')||null : municipalityId;
    if(!selectedMunicipalityId){setMessage('Selecione a prefeitura do profissional.');return;}

    const payload={
      name:String(form.get('name')??'').trim(),
      cns:cns||null,cbo:cbo||null,
      health_unit_id:String(form.get('health_unit_id')??'')||null,
      active:form.get('active')==='on',
      responsible_for_production:form.get('responsible_for_production')==='on',
      municipality_id:selectedMunicipalityId
    };
    if(!payload.name){setMessage('Informe o nome do profissional.');return;}

    setSaving(true);setMessage('');
    const result=editing
      ? await supabase.from('health_professionals').update(payload).eq('id',editing.id)
      : await supabase.from('health_professionals').insert(payload);
    if(result.error)setMessage('Não foi possível salvar: '+result.error.message);
    else{setShowForm(false);setEditing(null);setMessage(editing?'Profissional atualizado com sucesso.':'Profissional cadastrado com sucesso.');await loadData();}
    setSaving(false);
  }

  const visibleUnits=role==='ADMIN' ? units : units.filter(u=>u.municipality_id===municipalityId);
  const filtered=items.filter(item=>{
    const q=search.toLowerCase();
    const unit=units.find(u=>u.id===item.health_unit_id);
    return item.name.toLowerCase().includes(q) || (item.cns??'').includes(q) || (item.cbo??'').includes(q) || (unit?.name??'').toLowerCase().includes(q);
  });

  return <main className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
      <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
      <nav className="space-y-1 text-sm">{nav.map(([label,href])=><Link key={label} href={href} className={'block rounded-lg px-3 py-2 '+(label==='Profissionais SUS'?'bg-slate-100 font-semibold text-slate-900':'text-slate-600 hover:bg-slate-50')}>{label}</Link>)}</nav>
    </aside>
    <section className="md:ml-64 p-4 md:p-8"><div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Profissionais SUS</h1><p className="text-sm text-slate-500">{municipalityName||'Cadastro vinculado à prefeitura'}</p></div>
        {canManage&&<button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus size={18}/> Novo profissional</button>}
      </div>
      {message&&<div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}
      <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2"><Search size={18} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, CNS, CBO ou estabelecimento" className="w-full outline-none text-sm"/></div>

      {showForm&&<form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">{editing?'Editar profissional':'Novo profissional'}</h2><p className="text-xs text-slate-500">Base para vincular produção SUS ao profissional, CBO e CNES.</p></div><button type="button" onClick={()=>setShowForm(false)}><X size={20}/></button></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {role==='ADMIN'&&<label className="text-sm sm:col-span-2 lg:col-span-4">Prefeitura<select name="municipality_id" required defaultValue={editing?.municipality_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Selecione a prefeitura</option>{municipalities.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
          <label className="text-sm sm:col-span-2 lg:col-span-3">Nome<input name="name" required defaultValue={editing?.name??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">CNS<input name="cns" inputMode="numeric" maxLength={15} defaultValue={editing?.cns??''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="15 dígitos"/></label>
          <label className="text-sm">CBO<input name="cbo" inputMode="numeric" maxLength={6} defaultValue={editing?.cbo??''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="6 dígitos"/></label>
          <label className="text-sm sm:col-span-2">Estabelecimento<select name="health_unit_id" defaultValue={editing?.health_unit_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Não informado</option>{visibleUnits.map(u=><option key={u.id} value={u.id}>{u.name}{u.cnes?' • CNES '+u.cnes:''}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input name="responsible_for_production" type="checkbox" defaultChecked={editing?.responsible_for_production??false}/> Responsável pela produção</label>
          <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing?.active??true}/> Profissional ativo</label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving?'Salvando...':'Salvar profissional'}</button></div>
      </form>}

      <div className="overflow-hidden rounded-xl border bg-white">
        {loading?<div className="p-8 text-center text-sm text-slate-500">Carregando...</div>:filtered.length===0?<div className="p-8 text-center text-sm text-slate-500">Nenhum profissional cadastrado.</div>:
        <div className="divide-y">{filtered.map(item=>{const unit=units.find(u=>u.id===item.health_unit_id);return <div key={item.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><UserRound size={20}/></div><div>
            <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">{item.name}{item.responsible_for_production&&<span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Produção</span>}</div>
            <div className="mt-1 text-sm text-slate-500">{[item.cns&&'CNS '+item.cns,item.cbo&&'CBO '+item.cbo,unit?.name].filter(Boolean).join(' • ')||'Sem identificação SUS completa'}</div>
          </div></div>
          <div className="flex items-center gap-3"><span className={'rounded-full px-2.5 py-1 text-xs font-medium '+(item.active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600')}>{item.active?'Ativo':'Inativo'}</span>{canManage&&<button onClick={()=>openEdit(item)} className="rounded-lg border p-2 hover:bg-slate-50" title="Editar"><Pencil size={16}/></button>}</div>
        </div>})}</div>}
      </div>
    </div></section>
  </main>;
}
