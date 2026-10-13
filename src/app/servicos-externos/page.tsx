'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Shift = {id:string;driver_id:string;vehicle_id:string;started_at:string;ended_at:string|null;initial_mileage:number;final_mileage:number|null};
type Service = {id:string;shift_id:string;service_type:string;description:string;created_at:string};
type Driver = {id:string;name:string};
type Vehicle = {id:string;plate:string;current_mileage:number|null};
const labels:Record<string,string>={HOME_VISITS:'Visitas domiciliares',HEALTH_TEAM:'Apoio à equipe de saúde',ADMINISTRATIVE:'Serviço administrativo',MATERIALS:'Transporte de materiais',OTHER:'Outros'};
const db=createClient();
export default function ExternalServicesPage(){
 const [user,setUser]=useState('');const [role,setRole]=useState('');const [municipality,setMunicipality]=useState('');const [ownDriver,setOwnDriver]=useState('');
 const [drivers,setDrivers]=useState<Driver[]>([]);const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [shifts,setShifts]=useState<Shift[]>([]);const [services,setServices]=useState<Service[]>([]);
 const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');const [message,setMessage]=useState('');
 async function reload(m:string,driver:string,r:string){
  const [a,b,c,d]=await Promise.all([
   db.from('driver_work_shifts').select('id,driver_id,vehicle_id,started_at,ended_at,initial_mileage,final_mileage').eq('municipality_id',m).order('started_at',{ascending:false}).limit(100),
   db.from('driver_external_services').select('id,shift_id,service_type,description,created_at').eq('municipality_id',m).order('created_at',{ascending:false}).limit(300),
   db.from('drivers').select('id,name').eq('municipality_id',m).eq('active',true).order('name'),
   db.from('vehicles').select('id,plate,current_mileage').eq('municipality_id',m).order('plate')
  ]);
  const failure=a.error||b.error||c.error||d.error;if(failure){setError(failure.message);return;}
  const visible=(a.data??[]).filter(x=>r!=='MOTORISTA'||x.driver_id===driver) as Shift[];
  setShifts(visible);setServices((b.data??[]).filter(x=>visible.some(s=>s.id===x.shift_id)) as Service[]);
  setDrivers((c.data??[]).filter(x=>r!=='MOTORISTA'||x.id===driver));setVehicles(d.data??[]);
  setSelected(previous=>visible.some(s=>s.id===previous)?previous:(visible.find(s=>!s.ended_at)?.id??visible[0]?.id??''));
 }
 useEffect(()=>{let mounted=true;(async()=>{
  const {data:{user:u}}=await db.auth.getUser();if(!u){window.location.href='/login';return;}
  const {data:p,error:e}=await db.from('profiles').select('role,municipality_id,active').eq('id',u.id).single();
  if(!mounted)return;
  if(e||!p?.active||!p.municipality_id||!['ADMIN','GESTOR','OPERADOR','MOTORISTA'].includes(p.role)){setError('Acesso não autorizado.');setLoading(false);return;}
  let driver='';if(p.role==='MOTORISTA'){const {data:d}=await db.from('drivers').select('id').eq('profile_id',u.id).eq('active',true).maybeSingle();if(!d){setError('Motorista sem cadastro ativo.');setLoading(false);return;}driver=d.id;}
  if(!mounted)return;setUser(u.id);setRole(p.role);setMunicipality(p.municipality_id);setOwnDriver(driver);
  await reload(p.municipality_id,driver,p.role);if(mounted)setLoading(false);
 })();return()=>{mounted=false;};},[]);
 async function act(operation:()=>PromiseLike<{error:{message:string}|null}>,success:string){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const result=await operation();if(result.error)setError(result.error.message);else{setMessage(success);await reload(municipality,ownDriver,role);}}
  catch{setError('Não foi possível concluir a operação. Tente novamente.');}
  finally{setBusy(false);}
 }
 function start(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);
  const driver=role==='MOTORISTA'?ownDriver:String(f.get('driver'));const vehicle=String(f.get('vehicle'));const km=Number(f.get('km'));
  if(!driver||!vehicle||!Number.isFinite(km)||km<0){setError('Preencha motorista, veículo e KM inicial.');return;}
  const v=vehicles.find(x=>x.id===vehicle);
  if(v?.current_mileage!=null&&km<Number(v.current_mileage)){setError('KM inicial menor que o registrado no veículo.');return;}
  void act(()=>db.from('driver_work_shifts').insert({municipality_id:municipality,driver_id:driver,vehicle_id:vehicle,initial_mileage:km,created_by:user}), 'Expediente iniciado.');
 }
 function add(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const shift=shifts.find(s=>s.id===selected&&!s.ended_at);
  const description=String(f.get('description')??'').trim();if(!shift||!description){setError('Selecione um expediente aberto e informe o serviço.');return;}
  void act(()=>db.from('driver_external_services').insert({shift_id:shift.id,municipality_id:municipality,service_type:String(f.get('type')),description,created_by:user}), 'Serviço registrado.');
  form.reset();
 }
 function finish(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const shift=shifts.find(s=>s.id===selected&&!s.ended_at);if(!shift)return;
  const km=Number(new FormData(e.currentTarget).get('km'));const vehicle=vehicles.find(v=>v.id===shift.vehicle_id);
  if(!Number.isFinite(km)||km<Number(shift.initial_mileage)||km<Number(vehicle?.current_mileage??0)){setError('KM final inválido ou menor que o já registrado.');return;}
  void act(()=>db.from('driver_work_shifts').update({final_mileage:km,ended_at:new Date().toISOString()}).eq('id',shift.id).is('ended_at',null),'Expediente encerrado.');
 }
 const active=shifts.find(s=>s.id===selected&&!s.ended_at);
 const input='mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
 return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-16 sm:p-8">
  <Link href={role==='MOTORISTA'?'/motorista':'/viagens'} className="text-sm font-medium text-teal-700">← Voltar</Link>
  <header><h1 className="text-2xl font-bold text-slate-900">Serviços externos</h1><p className="text-sm text-slate-600">Expediente e serviços administrativos, equipes e visitas domiciliares.</p></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
  {loading?<p>Carregando...</p>:user&&<>
   <section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Iniciar expediente</h2><form onSubmit={start} className="grid gap-3 sm:grid-cols-3">
    {role!=='MOTORISTA'&&<label className="text-sm">Motorista<select name="driver" required className={input}><option value="">Selecione</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
    <label className="text-sm">Veículo<select name="vehicle" required className={input}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></label>
    <label className="text-sm">KM inicial<input name="km" type="number" min="0" step="0.1" required className={input}/></label>
    <button disabled={busy} className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Iniciar</button>
   </form></section>
   <section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Expedientes</h2><div className="space-y-2">
    {shifts.length===0?<p className="text-sm text-slate-500">Nenhum expediente.</p>:shifts.map(s=><button key={s.id} type="button" onClick={()=>setSelected(s.id)} className={`w-full rounded-xl border p-3 text-left text-sm ${selected===s.id?'border-teal-600 bg-teal-50':'border-slate-200'}`}>{drivers.find(d=>d.id===s.driver_id)?.name??'Motorista'} · {vehicles.find(v=>v.id===s.vehicle_id)?.plate??'Veículo'} · {new Date(s.started_at).toLocaleString('pt-BR')} · {s.ended_at?'Encerrado':'Em andamento'}</button>)}
   </div></section>
   {active&&<section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Registrar serviço</h2><form onSubmit={add} className="space-y-3">
    <label className="block text-sm">Tipo<select name="type" className={input}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
    <label className="block text-sm">Descrição rápida<input name="description" maxLength={1000} required className={input} placeholder="Ex.: UBS Centro — visitas domiciliares"/></label>
    <button disabled={busy} className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">+ Registrar serviço</button>
   </form></section>}
   {selected&&<section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Serviços registrados</h2><div className="space-y-2">{services.filter(s=>s.shift_id===selected).map(s=><div key={s.id} className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{labels[s.service_type]??s.service_type}</strong><p>{s.description}</p><p className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString('pt-BR')}</p></div>)}{!services.some(s=>s.shift_id===selected)&&<p className="text-sm text-slate-500">Nenhum serviço registrado.</p>}</div></section>}
   {active&&<section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Encerrar expediente</h2><p className="mb-3 text-sm text-slate-600">KM inicial: {active.initial_mileage}. Não é necessário finalizar os serviços individualmente.</p><form onSubmit={finish} className="flex flex-wrap items-end gap-3"><label className="text-sm">KM final<input name="km" type="number" step="0.1" min={active.initial_mileage} required className={input}/></label><button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">Encerrar expediente</button></form></section>}
  </>}
 </main>;
}