'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CarFront, CircleCheck, Gauge, Pencil, Plus, Search, Wrench, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
type Vehicle = {
  id: string; plate: string; brand: string | null; model: string | null; year: number | null;
  capacity: number; current_mileage: number; status: VehicleStatus; observations: string | null; wheelchair_accessible:boolean; renavam:string|null; insurance_expiry:string|null; licensing_expiry:string|null;
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
  const [statusFilter,setStatusFilter]=useState<'ALL'|VehicleStatus>('ALL');
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Vehicle|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  async function loadData() {
    setLoading(true);
    const {data,error}=await supabase.from('vehicles').select('id,plate,brand,model,year,capacity,current_mileage,status,observations,wheelchair_accessible,renavam,insurance_expiry,licensing_expiry').order('plate');
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
      wheelchair_accessible:form.get('wheelchair_accessible')==='on',renavam:String(form.get('renavam')??'').trim()||null,insurance_expiry:String(form.get('insurance_expiry')??'')||null,licensing_expiry:String(form.get('licensing_expiry')??'')||null,
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
    return (statusFilter==='ALL'||v.status===statusFilter)&&(v.plate.toLowerCase().includes(q)||(v.brand??'').toLowerCase().includes(q)||(v.model??'').toLowerCase().includes(q));
  });
  const counts={total:vehicles.length,available:vehicles.filter(v=>v.status==='AVAILABLE').length,use:vehicles.filter(v=>v.status==='IN_USE').length,maintenance:vehicles.filter(v=>v.status==='MAINTENANCE').length};

  return <main className="min-h-screen">
<section className=" p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><CarFront size={15}/> Gestão da frota</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Veículos</h1><p className="mt-1 text-sm text-slate-500">Acompanhe disponibilidade, documentação e situação operacional da frota municipal.</p></div>
          <button onClick={openNew} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"><Plus size={18}/> Novo veículo</button>
        </div>
        <div className="p-5 lg:p-8">{message&&<div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={<CarFront size={18}/>} label="Frota" value={counts.total}/><Stat icon={<CircleCheck size={18}/>} label="Disponíveis" value={counts.available}/><Stat icon={<Gauge size={18}/>} label="Em uso" value={counts.use}/><Stat icon={<Wrench size={18}/>} label="Em manutenção" value={counts.maintenance}/></div>
        <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row"><div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100"><Search size={18} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por placa, marca ou modelo" className="w-full outline-none text-sm"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as 'ALL'|VehicleStatus)} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="ALL">Todas as situações</option>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        {showForm&&<form onSubmit={save} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{editing?'Editar veículo':'Novo veículo'}</h2><button type="button" onClick={()=>setShowForm(false)}><X size={20}/></button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Placa<input name="plate" required defaultValue={editing?.plate??''} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"/></label>
            <label className="text-sm">Marca<input name="brand" defaultValue={editing?.brand??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Modelo<input name="model" defaultValue={editing?.model??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Ano<input name="year" type="number" min="1900" max="2100" defaultValue={editing?.year??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Capacidade<input name="capacity" type="number" min="1" required defaultValue={editing?.capacity??1} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">Quilometragem atual<input name="current_mileage" type="number" min="0" required defaultValue={editing?.current_mileage??0} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
            <label className="text-sm">RENAVAM<input name="renavam" defaultValue={editing?.renavam??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm">Licenciamento<input name="licensing_expiry" type="date" defaultValue={editing?.licensing_expiry??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm">Seguro<input name="insurance_expiry" type="date" defaultValue={editing?.insurance_expiry??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="flex items-end gap-2 pb-2 text-sm"><input name="wheelchair_accessible" type="checkbox" defaultChecked={editing?.wheelchair_accessible??false}/> Acessível para cadeirante</label><label className="text-sm">Situação<select name="status" defaultValue={editing?.status??'AVAILABLE'} className="mt-1 w-full rounded-lg border px-3 py-2">{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-sm sm:col-span-2 lg:col-span-4">Observações<textarea name="observations" rows={2} defaultValue={editing?.observations??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800">{saving?'Salvando...':'Salvar veículo'}</button></div>
        </form>}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading?<div className="p-8 text-center text-sm text-slate-500">Carregando...</div>:filtered.length===0?<div className="p-8 text-center text-sm text-slate-500">Nenhum veículo encontrado.</div>:
          <div className="divide-y">{filtered.map(v=><div key={v.id} className="flex flex-col gap-3 p-4 transition hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-2 text-teal-700"><CarFront size={20}/></div><div><div className="font-semibold text-slate-900">{v.plate}</div><div className="text-sm text-slate-500">{[v.brand,v.model,v.year].filter(Boolean).join(' • ')||'Sem descrição'}</div><div className="mt-1 text-xs text-slate-500">{v.capacity} lugares · {v.current_mileage.toLocaleString('pt-BR')} km{v.wheelchair_accessible?' · ♿ Acessível':''}</div></div></div>
            <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[v.status]}`}>{statusLabels[v.status]}</span><button onClick={()=>openEdit(v)} className="rounded-lg border p-2 hover:bg-slate-50" title="Editar"><Pencil size={16}/></button></div>
          </div>)}</div>}
        </div>
      </div>
    </section>
  </main>;
}

function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</div><div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>}
