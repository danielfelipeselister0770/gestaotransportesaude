'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { CarFront, Pencil, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
type Vehicle = {
  id: string; plate: string; brand: string | null; model: string | null; year: number | null;
  capacity: number; current_mileage: number; status: VehicleStatus; observations: string | null;
};

const statusLabels: Record<VehicleStatus,string> = {
  AVAILABLE:'Disponível', IN_USE:'Em uso', MAINTENANCE:'Manutenção', INACTIVE:'Inativo',
};
const statusClasses: Record<VehicleStatus,string> = {
  AVAILABLE:'bg-emerald-50 text-emerald-700', IN_USE:'bg-blue-50 text-blue-700',
  MAINTENANCE:'bg-amber-50 text-amber-700', INACTIVE:'bg-slate-100 text-slate-600',
};

export default function VehiclesPage() {
  const supabase = createClient();
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [search,setSearch]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Vehicle|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  async function loadData() {
    setLoading(true);
    const {data,error}=await supabase.from('vehicles').select('id,plate,brand,model,year,capacity,current_mileage,status,observations').order('plate');
    if(error) setMessage(`Erro ao carregar veículos: ${error.message}`);
    else setVehicles((data??[]) as Vehicle[]);
    setLoading(false);
  }
  useEffect(()=>{loadData();},[]);

  function openNew(){setEditing(null);setShowForm(true);setMessage('');}
  function openEdit(v:Vehicle){setEditing(v);setShowForm(true);setMessage('');}

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const form=new FormData(event.currentTarget);
    const payload={
      plate:String(form.get('plate')??'').trim().toUpperCase(),
      brand:String(form.get('brand')??'').trim()||null,
      model:String(form.get('model')??'').trim()||null,
      year:form.get('year') ? Number(form.get('year')) : null,
      capacity:Number(form.get('capacity')??0),
      current_mileage:Number(form.get('current_mileage')??0),
      status:String(form.get('status')??'AVAILABLE') as VehicleStatus,
      observations:String(form.get('observations')??'').trim()||null,
    };
    if(!payload.plate || payload.capacity<1 || payload.current_mileage<0){
      setMessage('Informe placa, capacidade maior que zero e quilometragem válida.');setSaving(false);return;
    }
    const result=editing
      ? await supabase.from('vehicles').update(payload).eq('id',editing.id)
      : await supabase.from('vehicles').insert(payload);
    if(result.error) setMessage(`Não foi possível salvar: ${result.error.message}`);
    else {setShowForm(false);setEditing(null);setMessage(editing?'Veículo atualizado.':'Veículo cadastrado.');await loadData();}
    setSaving(false);
  }

  const filtered=vehicles.filter(v=>{
    const q=search.toLowerCase();
    return v.plate.toLowerCase().includes(q)||(v.brand??'').toLowerCase().includes(q)||(v.model??'').toLowerCase().includes(q);
  });

  return <main className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-5 md:block">
      <div className="mb-8 text-xl font-bold">🚐 Transporte Saúde</div>
      <nav className="space-y-1 text-sm">
        {[['Dashboard','/'],['Pacientes','/pacientes'],['Solicitações','/solicitacoes'],['Agenda / Viagens','/viagens'],['Veículos','/veiculos'],['Motoristas','/motoristas'],['Abastecimentos','/abastecimentos'],['Manutenções','/manutencoes'],['Ocorrências','/ocorrencias'],['Relatórios','/relatorios'],['Configurações','/configuracoes']].map(([label,href])=>
          <Link key={label} href={href} className={`block rounded-lg px-3 py-2 ${label==='Veículos'?'bg-slate-100 font-semibold text-slate-900':'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>)}
      </nav>
    </aside>
    <section className="md:ml-64 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold text-slate-900">Veículos</h1><p className="text-sm text-slate-500">Cadastro e situação da frota municipal.</p></div>
          <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={18}/> Novo veículo</button>
        </div>
        {message&&<div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}
        <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
          <Search size={18} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por placa, marca ou modelo" className="w-full outline-none text-sm"/>
        </div>
        {showForm&&<form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{editing?'Editar veículo':'Novo veículo'}</h2><button type="button" onClick={()=>setShowForm(false)}><X size={20}/></button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Placa<input name="plate" required defaultValue={editing?.plate??''} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"/></label>
            <label className="text-sm">Marca<input name="brand" defaultValue={editing?.brand??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Modelo<input name="model" defaultValue={editing?.model??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Ano<input name="year" type="number" min="1900" max="2100" defaultValue={editing?.year??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Capacidade<input name="capacity" type="number" min="1" required defaultValue={editing?.capacity??1} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Quilometragem atual<input name="current_mileage" type="number" min="0" required defaultValue={editing?.current_mileage??0} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Situação<select name="status" defaultValue={editing?.status??'AVAILABLE'} className="mt-1 w-full rounded-lg border px-3 py-2">{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-sm sm:col-span-2 lg:col-span-4">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving?'Salvando...':'Salvar veículo'}</button></div>
        </form>}
        <div className="overflow-hidden rounded-xl border bg-white">
          {loading?<div className="p-8 text-center text-sm text-slate-500">Carregando...</div>:filtered.length===0?<div className="p-8 text-center text-sm text-slate-500">Nenhum veículo encontrado.</div>:
          <div className="divide-y">{filtered.map(v=><div key={v.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><CarFront size={20}/></div><div><div className="font-semibold text-slate-900">{v.plate}</div><div className="text-sm text-slate-500">{[v.brand,v.model,v.year].filter(Boolean).join(' • ')||'Sem descrição'}</div><div className="mt-1 text-xs text-slate-500">{v.capacity} lugares · {v.current_mileage.toLocaleString('pt-BR')} km</div></div></div>
            <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[v.status]}`}>{statusLabels[v.status]}</span><button onClick={()=>openEdit(v)} className="rounded-lg border p-2 hover:bg-slate-50" title="Editar"><Pencil size={16}/></button></div>
          </div>)}</div>}
        </div>
      </div>
    </section>
  </main>;
}
