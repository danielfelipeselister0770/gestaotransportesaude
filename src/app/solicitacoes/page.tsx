'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ClipboardList, Clock3, Edit3, Eye, History, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type RequestStatus = 'REQUESTED'|'APPROVED'|'SCHEDULED'|'COMPLETED'|'CANCELLED'|'DENIED'|'NO_SHOW';
type RequestRow = {
 id:string; municipality_id:string|null; patient_id:string; requested_by:string; date:string; time:string|null;
 origin:string; destination:string; health_unit_id:string|null; purpose:string|null; financing_distance_km:number|null; needs_companion:boolean;
 observations:string|null; status:RequestStatus; approved_by:string|null; approved_at:string|null; created_at:string;
 updated_at:string; cancellation_reason:string|null; cancelled_at:string|null; cancelled_by:string|null;
 denial_reason:string|null; denied_at:string|null; denied_by:string|null;
 patient:{name:string;cpf:string|null}|null; health_unit:{name:string}|null;
};
type Patient={id:string;name:string;cpf:string|null};
type HealthUnit={id:string;name:string;city:string|null};
type HistoryRow={id:string;action:string;old_status:RequestStatus|null;new_status:RequestStatus|null;note:string|null;changed_at:string};

const labels:Record<RequestStatus,string>={REQUESTED:'Solicitada',APPROVED:'Aprovada',SCHEDULED:'Agendada',COMPLETED:'Concluída',CANCELLED:'Cancelada',DENIED:'Negada',NO_SHOW:'Não compareceu'};
const colors:Record<RequestStatus,string>={REQUESTED:'bg-amber-50 text-amber-700',APPROVED:'bg-blue-50 text-blue-700',SCHEDULED:'bg-violet-50 text-violet-700',COMPLETED:'bg-emerald-50 text-emerald-700',CANCELLED:'bg-slate-100 text-slate-600',DENIED:'bg-red-50 text-red-700',NO_SHOW:'bg-orange-50 text-orange-700'};
const requestFields='id,municipality_id,patient_id,requested_by,date,time,origin,destination,health_unit_id,purpose,financing_distance_km,needs_companion,observations,status,approved_by,approved_at,created_at,updated_at,cancellation_reason,cancelled_at,cancelled_by,denial_reason,denied_at,denied_by,patient:patients(name,cpf),health_unit:health_units(name)';

export default function RequestsPage(){
 const supabase=createClient();
 const [requests,setRequests]=useState<RequestRow[]>([]),[patients,setPatients]=useState<Patient[]>([]),[units,setUnits]=useState<HealthUnit[]>([]);
 const [search,setSearch]=useState(''),[status,setStatus]=useState<'ALL'|RequestStatus>('ALL'),[unit,setUnit]=useState('ALL'),[date,setDate]=useState('');
 const [showForm,setShowForm]=useState(false),[editing,setEditing]=useState<RequestRow|null>(null),[selected,setSelected]=useState<RequestRow|null>(null);
 const [history,setHistory]=useState<HistoryRow[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('');

 async function load(){
  setLoading(true);
  const [a,b,c]=await Promise.all([
   supabase.from('transport_requests').select(requestFields).order('date',{ascending:true}).order('time',{ascending:true}),
   supabase.from('patients').select('id,name,cpf').eq('active',true).order('name'),
   supabase.from('health_units').select('id,name,city').eq('active',true).order('name')
  ]);
  if(a.error)setMessage('Erro ao carregar solicitações: '+a.error.message); else setRequests((a.data??[]).map(normalize) as unknown as RequestRow[]);
  if(!b.error)setPatients((b.data??[]) as unknown as Patient[]);
  if(!c.error)setUnits((c.data??[]) as unknown as HealthUnit[]);
  const requestedId=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('request'):null;
  if(requestedId&&a.data){const found=(a.data??[]).map(normalize).find((x:any)=>x.id===requestedId);if(found){setEditing(found as RequestRow);setShowForm(true);}}
  setLoading(false);
 }
 useEffect(()=>{load();},[]);

 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault(); setSaving(true); setMessage('');
  const fd=new FormData(e.currentTarget), patientId=String(fd.get('patient_id')??''), healthUnitId=String(fd.get('health_unit_id')??'')||null;
  const payload={patient_id:patientId,date:String(fd.get('date')??''),time:String(fd.get('time')??'')||null,origin:String(fd.get('origin')??'').trim(),destination:String(fd.get('destination')??'').trim(),health_unit_id:healthUnitId,purpose:String(fd.get('purpose')??'').trim()||null,financing_distance_km:fd.get('financing_distance_km')?Number(fd.get('financing_distance_km')):null,needs_companion:fd.get('needs_companion')==='on',observations:String(fd.get('observations')??'').trim()||null};
  if(!payload.patient_id||!payload.date||!payload.origin||!payload.destination){setMessage('Preencha paciente, data, origem e destino.');setSaving(false);return;}
  try{
   if(editing){
    if(!['REQUESTED','APPROVED'].includes(editing.status)){setMessage('Esta solicitação não pode mais ser editada.');return;}
    const {data,error}=await supabase.from('transport_requests').update(payload).eq('id',editing.id).select(requestFields).single();
    if(error){setMessage('Não foi possível editar: '+error.message);return;}
    const row=normalize(data) as unknown as RequestRow; setRequests(v=>v.map(x=>x.id===row.id?row:x)); setEditing(null);setShowForm(false);setMessage('Solicitação atualizada.');
   }else{
    const {data:user}=await supabase.auth.getUser(); if(!user.user){setMessage('Sessão expirada.');return;}
    const {data,error}=await supabase.from('transport_requests').insert({...payload,requested_by:user.user.id,status:'REQUESTED'}).select(requestFields).single();
    if(error){setMessage('Não foi possível criar: '+error.message);return;}
    setRequests(v=>[...v,normalize(data) as unknown as RequestRow].sort(sortRequests));setShowForm(false);setMessage('Solicitação criada com sucesso.');
   }
  }finally{setSaving(false);}
 }

 async function changeStatus(r:RequestRow,next:RequestStatus){
  const {data:user}=await supabase.auth.getUser(); if(!user.user){setMessage('Sessão expirada.');return;}
  const payload:Record<string,unknown>={status:next};
  if(next==='APPROVED'){payload.approved_by=user.user.id;payload.approved_at=new Date().toISOString();}
  if(next==='CANCELLED'){const reason=window.prompt('Informe o motivo do cancelamento:')?.trim();if(!reason)return;payload.cancellation_reason=reason;payload.cancelled_at=new Date().toISOString();payload.cancelled_by=user.user.id;}
  if(next==='DENIED'){const reason=window.prompt('Informe o motivo da negativa:')?.trim();if(!reason)return;payload.denial_reason=reason;payload.denied_at=new Date().toISOString();payload.denied_by=user.user.id;}
  const {data,error}=await supabase.from('transport_requests').update(payload).eq('id',r.id).select(requestFields).single();
  if(error){setMessage('Não foi possível atualizar: '+error.message);return;}
  const row=normalize(data) as unknown as RequestRow;setRequests(v=>v.map(x=>x.id===row.id?row:x));if(selected?.id===row.id)await openDetail(row);setMessage('Solicitação '+labels[next].toLowerCase()+'.');
 }

 async function openDetail(r:RequestRow){
  setSelected(r);const {data}=await supabase.from('transport_request_history').select('id,action,old_status,new_status,note,changed_at').eq('request_id',r.id).order('changed_at',{ascending:false});
  setHistory((data??[]) as unknown as HistoryRow[]);
 }

 const today=new Date().toISOString().slice(0,10);
 const filtered=useMemo(()=>requests.filter(r=>{
  const q=search.toLowerCase().trim(), digits=search.replace(/\D/g,'');
  const hit=!q||(r.patient?.name??'').toLowerCase().includes(q)||(r.patient?.cpf??'').includes(digits)||r.origin.toLowerCase().includes(q)||r.destination.toLowerCase().includes(q)||(r.purpose??'').toLowerCase().includes(q);
  return hit&&(status==='ALL'||r.status===status)&&(unit==='ALL'||r.health_unit_id===unit)&&(!date||r.date===date);
 }),[requests,search,status,unit,date]);
 const counts=useMemo(()=>({total:requests.length,today:requests.filter(r=>r.date===today).length,requested:requests.filter(r=>r.status==='REQUESTED').length,approved:requests.filter(r=>r.status==='APPROVED').length,scheduled:requests.filter(r=>r.status==='SCHEDULED').length}),[requests,today]);

 return <main className="min-h-screen"><section>
  <header className="flex flex-col gap-4 border-b border-slate-200/80 bg-white px-5 py-5 md:flex-row md:items-center md:justify-between lg:px-8"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><ClipboardList size={15}/> Atendimento e planejamento</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Solicitações de transporte</h1><p className="mt-1 text-sm text-slate-500">Organize pedidos, aprovações e encaminhamentos para a agenda.</p></div><button onClick={()=>{setEditing(null);setShowForm(true)}} className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"><Plus size={18}/> Nova solicitação</button></header>
  <div className="p-5 lg:p-8">{message&&<div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}
   <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Card label="Total" value={counts.total} icon={<ClipboardList size={18}/>}/><Card label="Hoje" value={counts.today} icon={<CalendarDays size={18}/>}/><Card label="Solicitadas" value={counts.requested} icon={<Clock3 size={18}/>}/><Card label="Aprovadas" value={counts.approved} icon={<CheckCircle2 size={18}/>}/><Card label="Agendadas" value={counts.scheduled} icon={<CalendarDays size={18}/>}/></div>
   {showForm&&<RequestForm request={editing} patients={patients} units={units} saving={saving} onSubmit={save} onCancel={()=>{setShowForm(false);setEditing(null)}}/>}
   <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100"><Search size={17}/><input type="search" aria-label="Buscar solicitações por paciente, CPF, origem ou destino" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Paciente, CPF, origem ou destino..." className="w-full py-2.5 text-sm outline-none"/></div><Filter value={status} set={v=>setStatus(v as typeof status)} options={[['ALL','Todos os status'],...Object.entries(labels)]}/><Filter value={unit} set={setUnit} options={[['ALL','Todas as unidades'],...units.map(u=>[u.id,u.name] as [string,string])]}/><input type="date" aria-label="Filtrar solicitações por data" value={date} onChange={e=>setDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/><button onClick={()=>{setStatus('ALL');setUnit('ALL');setDate('');setSearch('')}} className="rounded-lg border px-3 py-2 text-sm">Limpar filtros</button></div></div>
   <div className="mb-2 text-sm text-slate-500">{filtered.length} solicitação(ões) encontrada(s)</div>
   <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">{loading?<div className="p-8 text-center text-sm">Carregando...</div>:filtered.length===0?<div className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação encontrada.</div>:filtered.map(r=><div key={r.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 transition last:border-0 hover:bg-slate-50/70 lg:grid-cols-[1.4fr_1fr_1.5fr_1fr_220px] lg:items-center"><div><b>{r.patient?.name??'Paciente não encontrado'}</b><div className="text-xs text-slate-500">{r.health_unit?.name??r.purpose??'Sem unidade informada'}</div></div><div className="text-sm">{formatDate(r.date)}<div className="text-slate-500">{r.time?.slice(0,5)||'Sem horário'}</div></div><div className="text-sm">{r.origin}<div className="text-slate-400">→ {r.destination}</div></div><div><span className={'rounded-full px-2 py-1 text-xs '+colors[r.status]}>{labels[r.status]}</span>{r.needs_companion&&<div className="mt-1 text-xs text-slate-500">Acompanhante</div>}</div><div className="flex flex-wrap gap-1.5"><Btn title="Ficha" click={()=>openDetail(r)}><Eye size={15}/></Btn>{['REQUESTED','APPROVED'].includes(r.status)&&<Btn title="Editar" click={()=>{setEditing(r);setShowForm(true)}}><Edit3 size={15}/></Btn>}{r.status==='REQUESTED'&&<><Btn title="Aprovar" click={()=>changeStatus(r,'APPROVED')}><Check size={15}/></Btn><Btn title="Negar" click={()=>changeStatus(r,'DENIED')}><X size={15}/></Btn></>}{['REQUESTED','APPROVED','SCHEDULED'].includes(r.status)&&<button onClick={()=>changeStatus(r,'CANCELLED')} className="rounded-lg border px-2 py-1 text-xs">Cancelar</button>}</div></div>)}</div>
  </div>
 </section>
 {selected&&<Detail r={selected} history={history} close={()=>setSelected(null)}/>}
 </main>;
}

function RequestForm({request,patients,units,saving,onSubmit,onCancel}:{request:RequestRow|null;patients:Patient[];units:HealthUnit[];saving:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}){
 return <form key={request?.id??'new'} onSubmit={onSubmit} className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><h2 className="text-lg font-bold tracking-tight text-slate-950">{request?'Editar solicitação':'Nova solicitação'}</h2><button type="button" onClick={onCancel} aria-label="Fechar formulário de solicitação" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><X size={18}/></button></div><div className="grid gap-4 md:grid-cols-2"><Select name="patient_id" label="Paciente" value={request?.patient_id}><option value="">Selecione</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}{p.cpf?' — '+p.cpf:''}</option>)}</Select><Select name="health_unit_id" label="Unidade de saúde" value={request?.health_unit_id}><option value="">Não informada</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</Select><Field name="date" label="Data" type="date" value={request?.date} required/><Field name="time" label="Horário" type="time" value={request?.time?.slice(0,5)}/><Field name="origin" label="Origem" value={request?.origin} required/><Field name="destination" label="Destino" value={request?.destination} required/><Field name="purpose" label="Finalidade" value={request?.purpose}/><Field name="financing_distance_km" label="Distância de referência SUS (km)" type="number" value={request?.financing_distance_km?.toString()}/></div><label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700"><input name="needs_companion" type="checkbox" defaultChecked={request?.needs_companion??false} className="h-4 w-4 accent-teal-700"/> Necessita acompanhante</label><label className="mt-5 block text-sm font-medium text-slate-700">Observações<textarea name="observations" defaultValue={request?.observations??''} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label><div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60">{saving?'Salvando...':request?'Salvar alterações':'Criar solicitação'}</button></div></form>
}
function Detail({r,history,close}:{r:RequestRow;history:HistoryRow[];close:()=>void}){
 const dialogRef=useRef<HTMLDivElement>(null);
 const buttonRef=useRef<HTMLButtonElement>(null);
 const closeRef=useRef(close);
 useEffect(()=>{closeRef.current=close;},[close]);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  buttonRef.current?.focus();
  function onKey(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
   if(event.key!=='Tab')return;
   const buttons=dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
   if(!buttons?.length)return;
   const first=buttons[0],last=buttons[buttons.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',onKey);
  return ()=>{document.removeEventListener('keydown',onKey);previous?.focus();};
 },[]);
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Detalhes da solicitação de ${r.patient?.name??"paciente"}`} className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-h-[90vh] sm:p-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold text-slate-950 sm:text-xl">{r.patient?.name}</h2><span className={'mt-2 inline-block rounded-full px-2 py-1 text-xs '+colors[r.status]}>{labels[r.status]}</span></div><button ref={buttonRef} type="button" onClick={close} aria-label="Fechar detalhes da solicitação" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><X size={20}/></button></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Info l="Data / hora" v={formatDate(r.date)+' '+(r.time?.slice(0,5)||'')}/><Info l="Unidade" v={r.health_unit?.name||'Não informada'}/><Info l="Origem" v={r.origin}/><Info l="Destino" v={r.destination}/><Info l="Finalidade" v={r.purpose||'Não informada'}/><Info l="Acompanhante" v={r.needs_companion?'Sim':'Não'}/><Info l="Observações" v={r.observations||'Nenhuma'}/>{r.approved_at&&<Info l="Aprovada em" v={formatDateTime(r.approved_at)}/>} {r.cancellation_reason&&<Info l="Motivo do cancelamento" v={r.cancellation_reason}/>} {r.denial_reason&&<Info l="Motivo da negativa" v={r.denial_reason}/>}</div><div className="mt-6 border-t border-slate-200 pt-4"><h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><History size={16}/> Histórico</h3>{history.length===0?<p className="text-sm text-slate-500">Sem movimentações registradas.</p>:history.map(h=><div key={h.id} className="mb-3 border-l-2 pl-3 text-sm"><b>{h.action==='CREATED'?'Solicitação criada':h.action==='STATUS_CHANGED'?(h.old_status?labels[h.old_status]+' → ':'')+labels[h.new_status! ]:'Solicitação editada'}</b><div className="text-xs text-slate-500">{formatDateTime(h.changed_at)}{h.note?' · '+h.note:''}</div></div>)}</div></div></div>}
function Card({label,value,icon}:{label:string;value:number;icon:React.ReactNode}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</div><div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>}
function Btn({title,click,children}:{title:string;click:()=>void;children:React.ReactNode}){return <button type="button" title={title} aria-label={title} onClick={click} className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">{children}</button>}
function Field({name,label,type='text',value,required}:{name:string;label:string;type?:string;value?:string|null;required?:boolean}){return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span><input name={name} type={type} defaultValue={value??''} required={required} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"/></label>}
function Select({name,label,value,children}:{name:string;label:string;value?:string|null;children:React.ReactNode}){return <label><span className="mb-1 block text-sm font-medium">{label}</span><select name={name} defaultValue={value??''} required={name==='patient_id'} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{children}</select></label>}
function Filter({value,set,options}:{value:string;set:(v:string)=>void;options:[string,string][]}){return <select aria-label={options[0]?.[1]??"Filtrar solicitações"} value={value} onChange={e=>set(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}
function Info({l,v}:{l:string;v:string}){return <div><div className="text-xs text-slate-500">{l}</div><div className="text-sm font-medium">{v}</div></div>}
function normalize(row:any){return {...row,patient:Array.isArray(row?.patient)?row.patient[0]??null:row?.patient??null,health_unit:Array.isArray(row?.health_unit)?row.health_unit[0]??null:row?.health_unit??null}}
function sortRequests(a:RequestRow,b:RequestRow){return (a.date+'T'+(a.time??'')).localeCompare(b.date+'T'+(b.time??''))}
function formatDate(v:string){return new Date(v+'T00:00:00').toLocaleDateString('pt-BR')}
function formatDateTime(v:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}
