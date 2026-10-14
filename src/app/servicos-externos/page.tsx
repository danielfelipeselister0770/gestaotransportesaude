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
 const [exporting,setExporting]=useState(false);
 const [summary,setSummary]=useState({total_km:0,completed_shifts:0});
 const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');const [message,setMessage]=useState('');
 const [filterDriver,setFilterDriver]=useState('');const [filterVehicle,setFilterVehicle]=useState('');const [dateFrom,setDateFrom]=useState('');const [dateTo,setDateTo]=useState('');const [page,setPage]=useState(1);const [totalCount,setTotalCount]=useState(0);
 async function reload(m:string,driver:string,r:string){
  let query=db.from('driver_work_shifts').select('id,driver_id,vehicle_id,started_at,ended_at,initial_mileage,final_mileage',{count:'exact'}).eq('municipality_id',m);
  if(r==='MOTORISTA')query=query.eq('driver_id',driver);
  else if(filterDriver)query=query.eq('driver_id',filterDriver);
  if(filterVehicle)query=query.eq('vehicle_id',filterVehicle);
  if(dateFrom)query=query.gte('started_at',new Date(dateFrom+'T00:00:00-03:00').toISOString());
  if(dateTo)query=query.lt('started_at',new Date(new Date(dateTo+'T00:00:00-03:00').getTime()+86400000).toISOString());
  const summaryDriver=r==='MOTORISTA'?driver:(filterDriver||null);
  const [a,c,d,summaryResult]=await Promise.all([
   query.order('started_at',{ascending:false}).range((page-1)*10,page*10-1),
   db.from('drivers').select('id,name').eq('municipality_id',m).eq('active',true).order('name'),
   db.from('vehicles').select('id,plate,current_mileage').eq('municipality_id',m).order('plate'),
   db.rpc('external_shift_km_summary',{
    p_municipality_id:m,p_driver_id:summaryDriver,p_vehicle_id:filterVehicle||null,
    p_date_from:dateFrom?new Date(dateFrom+'T00:00:00-03:00').toISOString():null,
    p_date_to_exclusive:dateTo?new Date(new Date(dateTo+'T00:00:00-03:00').getTime()+86400000).toISOString():null
   })
  ]);
  const failure=a.error||c.error||d.error||summaryResult.error;if(failure){setError(failure.message);return;}
  const visible=(a.data??[]) as Shift[];
  const ids=visible.map(s=>s.id);
  const b=ids.length?await db.from('driver_external_services').select('id,shift_id,service_type,description,created_at').in('shift_id',ids).order('created_at',{ascending:false}):null;
  if(b?.error){setError(b.error.message);return;}
  setSummary({total_km:Number(summaryResult.data?.[0]?.total_km??0),completed_shifts:Number(summaryResult.data?.[0]?.completed_shifts??0)});
  setTotalCount(a.count??0);setShifts(visible);setServices((b?.data??[]) as Service[]);
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
 async function start(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  const f=new FormData(e.currentTarget);
  const driver=role==='MOTORISTA'?ownDriver:String(f.get('driver')??'');
  const vehicle=String(f.get('vehicle')??'');
  const km=Number(f.get('km'));
  const type=String(f.get('type')??'');
  const description=String(f.get('description')??'').trim();
  if(!driver||!vehicle||!Number.isFinite(km)||km<0||!labels[type]||!description){setError('Preencha motorista, veículo, KM inicial, tipo e descrição do serviço.');return;}
  const v=vehicles.find(x=>x.id===vehicle);
  if(v?.current_mileage!=null&&km<Number(v.current_mileage)){setError('KM inicial menor que o registrado no veículo.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const {data:shiftId,error:startError}=await db.rpc('start_external_shift_with_service',{
    p_municipality_id:municipality,
    p_driver_id:driver,
    p_vehicle_id:vehicle,
    p_initial_mileage:km,
    p_service_type:type,
    p_description:description
   });
   if(startError||!shiftId){setError(startError?.message??'Não foi possível iniciar o expediente. Nenhum registro foi criado.');return;}
   setMessage('Expediente iniciado e primeiro serviço registrado.');
   setSelected(shiftId);await reload(municipality,ownDriver,role);
  }catch{setError('Não foi possível concluir a operação. Confira os expedientes antes de tentar novamente.');}
  finally{setBusy(false);}
 }
 function add(e:FormEvent<HTMLFormElement>,shiftId:string){
  e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const shift=shifts.find(s=>s.id===shiftId&&!s.ended_at);
  const description=String(f.get('description')??'').trim();if(!shift||!description){setError('Selecione um expediente aberto e informe o serviço.');return;}
  void act(()=>db.from('driver_external_services').insert({shift_id:shift.id,municipality_id:municipality,service_type:String(f.get('type')),description,created_by:user}), 'Serviço registrado.');
  form.reset();
 }
 async function finish(e:FormEvent<HTMLFormElement>,shiftId:string){
  e.preventDefault();if(busy)return;
  const shift=shifts.find(s=>s.id===shiftId&&!s.ended_at);
  if(!shift){setError('Este expediente já não está disponível para encerramento.');return;}
  const km=Number(new FormData(e.currentTarget).get('km'));
  const vehicle=vehicles.find(v=>v.id===shift.vehicle_id);
  if(!Number.isFinite(km)||km<Number(shift.initial_mileage)||km<Number(vehicle?.current_mileage??0)){setError('KM final inválido ou menor que o já registrado.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const {data,error:closeError}=await db.from('driver_work_shifts')
    .update({final_mileage:km,ended_at:new Date().toISOString()})
    .eq('id',shift.id).is('ended_at',null).select('id');
   if(closeError)setError(closeError.message);
   else if(!data?.length)setMessage('Este expediente já foi encerrado por outro usuário. A lista foi atualizada.');
   else setMessage('Expediente encerrado com sucesso. Responsável registrado.');
   await reload(municipality,ownDriver,role);
  }catch{setError('Não foi possível encerrar o expediente. Atualize a tela e tente novamente.');}
  finally{setBusy(false);}
 }

 async function printReport(){
  if(exporting||!municipality)return;
  const popup=window.open('','_blank');
  if(!popup){setError('Permita pop-ups para abrir o relatório em PDF.');return;}
  setExporting(true);setError('');
  try{
   const all:Shift[]=[];
   for(let offset=0;;offset+=500){
    let q=db.from('driver_work_shifts').select('id,driver_id,vehicle_id,started_at,ended_at,initial_mileage,final_mileage').eq('municipality_id',municipality);
    if(role==='MOTORISTA')q=q.eq('driver_id',ownDriver);
    else if(filterDriver)q=q.eq('driver_id',filterDriver);
    if(filterVehicle)q=q.eq('vehicle_id',filterVehicle);
    if(dateFrom)q=q.gte('started_at',new Date(dateFrom+'T00:00:00-03:00').toISOString());
    if(dateTo)q=q.lt('started_at',new Date(new Date(dateTo+'T00:00:00-03:00').getTime()+86400000).toISOString());
    const {data,error:e}=await q.order('started_at',{ascending:false}).range(offset,offset+499);
    if(e)throw new Error(e.message);
    all.push(...((data??[]) as Shift[]));
    if((data??[]).length<500)break;
   }
   const {data:municipalityInfo,error:municipalityError}=await db.from('municipalities').select('name,city,state,cnpj').eq('id',municipality).single();
   if(municipalityError)throw new Error('Não foi possível identificar o município: '+municipalityError.message);
   const entries:Service[]=[];
   for(let i=0;i<all.length;i+=100){
    const ids=all.slice(i,i+100).map(s=>s.id);
    const {data,error:e}=await db.from('driver_external_services').select('id,shift_id,service_type,description,created_at').in('shift_id',ids).order('created_at',{ascending:true});
    if(e)throw new Error(e.message);
    entries.push(...((data??[]) as Service[]));
   }
   const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??ch));
   const formatKm=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:1});
   const formatDate=(s:string)=>new Date(s).toLocaleString('pt-BR');
   const km=all.reduce((sum,s)=>sum+(s.ended_at&&s.final_mileage!==null?Math.max(0,Number(s.final_mileage)-Number(s.initial_mileage)):0),0);
   const rows=all.map(s=>{
    const name=drivers.find(d=>d.id===s.driver_id)?.name??'Motorista não identificado';
    const plate=vehicles.find(v=>v.id===s.vehicle_id)?.plate??'Veículo não identificado';
    const related=entries.filter(e=>e.shift_id===s.id);
    const details=related.map(e=>'<li>'+escape(labels[e.service_type]??e.service_type)+' — '+escape(e.description)+' ('+escape(formatDate(e.created_at))+')</li>').join('');
    return '<section class="entry"><h3>'+escape(name)+' · '+escape(plate)+'</h3><p><b>Entrada:</b> '+escape(formatDate(s.started_at))+' | <b>Saída:</b> '+(s.ended_at?escape(formatDate(s.ended_at)):'Em andamento')+'</p><p><b>KM inicial:</b> '+escape(formatKm(Number(s.initial_mileage)))+' | <b>KM final:</b> '+(s.final_mileage!==null?escape(formatKm(Number(s.final_mileage))):'—')+' | <b>Percorrido:</b> '+(s.ended_at&&s.final_mileage!==null?escape(formatKm(Math.max(0,Number(s.final_mileage)-Number(s.initial_mileage))))+' km':'Aguardando encerramento')+'</p><p><b>Serviços:</b> '+related.length+'</p>'+(details?'<ul>'+details+'</ul>':'<p>Nenhum serviço registrado.</p>')+'</section>';
   }).join('');
   const period=(dateFrom||'Início')+' até '+(dateTo||'Hoje');
   const municipalityLabel=[municipalityInfo?.name, [municipalityInfo?.city,municipalityInfo?.state].filter(Boolean).join(' / ')].filter(Boolean).join(' — ');
   const institution='<header class="institution"><div class="brand"><img class="vita-logo" src="'+escape(window.location.origin+'/Logo%20VitaRota%20com%20%C3%8Dcone%20de%20Rota%20M%C3%A9dica.png')+'" alt="Logotipo VitaRota"><div><div class="instname">'+escape(municipalityInfo?.name??'Município')+'</div><div class="instsub">'+escape([municipalityInfo?.city,municipalityInfo?.state].filter(Boolean).join(' / '))+'</div>'+(municipalityInfo?.cnpj?'<div class="instsub">CNPJ: '+escape(municipalityInfo.cnpj)+'</div>':'')+'</div></div><div class="system">VitaRota<br><small>Gestão de Transporte em Saúde</small></div></header>';
   const signatures='<section class="signatures"><div><div class="signline"></div><strong>Motorista</strong><p>Nome e assinatura</p></div><div><div class="signline"></div><strong>Responsável pelo setor</strong><p>Nome, assinatura e carimbo</p></div></section><p class="footnote">Documento emitido pelo VitaRota. As assinaturas são destinadas à conferência administrativa.</p>';
   const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>VitaRota - Relatório de Serviços Externos</title><style>body{font:12px Arial,sans-serif;color:#172a35;margin:28px}.institution{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:2px solid #087e76;padding:8px 0 14px;margin-bottom:20px}.brand{display:flex;align-items:center;gap:12px}.vita-logo{display:block;width:125px;max-height:70px;object-fit:contain;object-position:left center}.instname{font-weight:bold;font-size:16px}.instsub{font-size:11px;color:#475569;margin-top:3px}.system{text-align:right;font-size:16px;font-weight:bold;color:#087e76}.system small{font-size:9px;font-weight:normal;color:#475569}.signatures{display:flex;justify-content:space-around;gap:32px;margin-top:60px;break-inside:avoid;text-align:center}.signatures>div{width:45%}.signline{border-top:1px solid #334155;margin-bottom:8px}.signatures p{margin:4px 0;color:#64748b;font-size:10px}.footnote{margin-top:28px;font-size:9px;color:#64748b;text-align:center}h1{color:#087e76;margin-bottom:4px}h2{font-size:14px}.meta{color:#475569}.entry{border-top:1px solid #cbd5e1;padding:10px 0;break-inside:avoid}.entry h3{margin:0 0 8px;font-size:13px}.entry p{margin:5px 0}li{margin:4px 0}.summary{background:#edf8f6;padding:12px;margin:16px 0}button{padding:10px 16px;background:#087e76;color:white;border:0;border-radius:6px}@media print{button{display:none}body{margin:0}.signatures{margin-top:55px}@page{size:A4;margin:16mm}}</style></head><body><button onclick="window.print()">Imprimir / Salvar em PDF</button>'+institution+'<h1>Relatório de Serviços Externos</h1><h2>'+escape(municipalityLabel)+'</h2><p class="meta">Período: '+escape(period)+' | Emitido em: '+escape(new Date().toLocaleString('pt-BR'))+'</p><p class="meta">Motorista: '+escape(role==='MOTORISTA'?drivers.find(d=>d.id===ownDriver)?.name??'Meu histórico':drivers.find(d=>d.id===filterDriver)?.name??'Todos')+' | Veículo: '+escape(vehicles.find(v=>v.id===filterVehicle)?.plate??'Todos')+'</p><div class="summary"><b>'+all.length+' expedientes · '+all.filter(s=>s.ended_at).length+' encerrados · '+escape(formatKm(km))+' km percorridos</b></div>'+(rows||'<p>Nenhum expediente encontrado.</p>')+signatures+'</body></html>';
   popup.document.open();popup.document.write(html);popup.document.close();
  }catch(err){popup.close();setError(err instanceof Error?err.message:'Falha ao preparar relatório.');}
  finally{setExporting(false);}
 }
 const totalPages=Math.max(1,Math.ceil(totalCount/10));
 const currentPage=page;
 const visibleShifts=shifts;
 useEffect(()=>setPage(1),[filterDriver,filterVehicle,dateFrom,dateTo]);
 useEffect(()=>{if(municipality)void reload(municipality,ownDriver,role);},[municipality,ownDriver,role,filterDriver,filterVehicle,dateFrom,dateTo,page]);
 useEffect(()=>{
  if(!municipality)return;
  let activeSubscription=true;
  let pending:ReturnType<typeof setTimeout>|null=null;
  const refresh=()=>{if(!activeSubscription)return;if(pending)clearTimeout(pending);pending=setTimeout(()=>{if(activeSubscription)void reload(municipality,ownDriver,role);},250);};
  const channel=db.channel('external-shifts-'+municipality)
   .on('postgres_changes',{event:'*',schema:'public',table:'driver_work_shifts',filter:'municipality_id=eq.'+municipality},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'driver_external_services',filter:'municipality_id=eq.'+municipality},refresh)
   .subscribe();
  const onVisible=()=>{if(document.visibilityState==='visible')refresh();};
  document.addEventListener('visibilitychange',onVisible);
  const interval=setInterval(()=>{if(document.visibilityState==='visible')refresh();},15000);
  return ()=>{activeSubscription=false;if(pending)clearTimeout(pending);clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);void db.removeChannel(channel);};
 },[municipality,ownDriver,role,filterDriver,filterVehicle,dateFrom,dateTo,page]);

 const input='mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
 return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-16 sm:p-8">
  <Link href={role==='MOTORISTA'?'/motorista':'/viagens'} className="text-sm font-medium text-teal-700">← Voltar</Link>
  <header><h1 className="text-2xl font-bold text-slate-900">Serviços externos</h1><p className="text-sm text-slate-600">Expediente e serviços administrativos, equipes e visitas domiciliares.</p></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
  {loading?<p>Carregando...</p>:user&&<>
   <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 sm:p-5">
    <h2 className="mb-4 text-lg font-bold text-slate-900">{role==='MOTORISTA'?'Meu expediente':'Gestão de expedientes'}</h2>
    <div className="space-y-4">
     <section className="rounded-2xl border bg-white p-5">
      <h3 className="mb-3 font-semibold">Iniciar expediente e registrar primeiro serviço</h3>
      <form onSubmit={start} className="space-y-3">
       <div className="grid gap-3 sm:grid-cols-2">
        {role!=='MOTORISTA'&&<label className="text-sm">Motorista<select name="driver" required className={input}><option value="">Selecione</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        <label className="text-sm">Veículo<select name="vehicle" required className={input}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></label>
        <label className="text-sm">KM inicial<input name="km" type="number" min="0" step="0.1" required className={input}/></label>
        <label className="text-sm">Tipo de serviço<select name="type" required className={input}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
       </div>
       <label className="block text-sm">Descrição do primeiro serviço<input name="description" maxLength={1000} required className={input} placeholder="Ex.: UBS Centro — visitas domiciliares"/></label>
       <button disabled={busy} className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Iniciar expediente</button>
      </form>
     </section>


    </div>
   </section>
   <section className="rounded-2xl border bg-white p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Consultar expedientes e serviços</h2><button type="button" disabled={exporting} onClick={()=>void printReport()} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{exporting?"Preparando relatório...":"Relatório / Salvar PDF"}</button></div><p className="mb-4 text-sm text-slate-600">Filtre o histórico, confira os serviços e encerre um expediente em andamento diretamente no cartão correspondente.</p>
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
     <label className="text-sm">Motorista<select value={filterDriver} onChange={e=>setFilterDriver(e.target.value)} className={input}><option value="">Todos os motoristas</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
     <label className="text-sm">Veículo<select value={filterVehicle} onChange={e=>setFilterVehicle(e.target.value)} className={input}><option value="">Todos os veículos</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></label>
     <label className="text-sm">Data inicial<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className={input}/></label>
     <label className="text-sm">Data final<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className={input}/></label>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{totalCount} expedientes encontrados</span><strong>KM total filtrado: {summary.total_km.toLocaleString('pt-BR',{maximumFractionDigits:1})} km · {summary.completed_shifts} encerrados</strong></div>
    <div className="space-y-3">
     {visibleShifts.length===0?<p className="text-sm text-slate-500">Nenhum expediente encontrado para os filtros selecionados.</p>:visibleShifts.map(s=>{
      const expanded=selected===s.id;
      const shiftServices=services.filter(item=>item.shift_id===s.id);
      return <div key={s.id} className={`rounded-xl border text-sm ${expanded?'border-teal-600 bg-teal-50':'border-slate-200 bg-white'}`}>
       <button type="button" aria-expanded={expanded} onClick={()=>setSelected(expanded?'':s.id)} className="w-full p-3 text-left">
        <span className="flex flex-wrap items-center justify-between gap-2">
         <strong>{drivers.find(d=>d.id===s.driver_id)?.name??'Motorista'} · {vehicles.find(v=>v.id===s.vehicle_id)?.plate??'Veículo'}</strong>
         <span className="flex items-center gap-2"><span className={s.ended_at?'rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700':'rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800'}>{s.ended_at?'Encerrado':'Em andamento'}</span><span aria-hidden="true">{expanded?'▲':'▼'}</span></span>
        </span>
        <span className="mt-2 grid gap-1 text-slate-700 sm:grid-cols-2">
         <span>Entrada: {new Date(s.started_at).toLocaleString('pt-BR')}</span>
         <span>Saída: {s.ended_at?new Date(s.ended_at).toLocaleString('pt-BR'):'—'}</span>
         <span>KM inicial: {Number(s.initial_mileage).toLocaleString('pt-BR')}</span>
         <span>KM final: {s.final_mileage!==null?Number(s.final_mileage).toLocaleString('pt-BR'):'—'}</span>
         <span className="font-semibold sm:col-span-2">Distância percorrida: {s.final_mileage!==null?(Number(s.final_mileage)-Number(s.initial_mileage)).toLocaleString('pt-BR')+' km':'Aguardando encerramento'}</span>
        </span>
        <span className="mt-2 block text-xs text-slate-600">{shiftServices.length} {shiftServices.length===1?'serviço registrado':'serviços registrados'} · {expanded?'Recolher detalhes':'Ver serviços'}</span>
       </button>
       {expanded&&<div className="space-y-2 border-t border-teal-200 p-3">
        <h3 className="font-semibold">Serviços deste expediente</h3>
        {shiftServices.length===0?<p className="text-slate-500">Nenhum serviço registrado neste expediente.</p>:shiftServices.map(item=><div key={item.id} className="rounded-lg bg-white p-3">
         <strong>{labels[item.service_type]??item.service_type}</strong>
         <p>{item.description}</p>
         <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString('pt-BR')}</p>
        </div>)}
       </div>}
       {!s.ended_at&&expanded&&<form onSubmit={e=>add(e,s.id)} className="space-y-3 border-t border-teal-200 bg-white p-3">
        <h3 className="font-semibold text-slate-900">Adicionar serviço a este expediente</h3>
        <label className="block text-sm">Tipo<select name="type" className={input}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
        <label className="block text-sm">Descrição rápida<input name="description" maxLength={1000} required className={input} placeholder="Ex.: UBS Centro — visitas domiciliares"/></label>
        <button disabled={busy} className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">+ Registrar serviço</button>
       </form>}
       {!s.ended_at&&expanded&&<form onSubmit={e=>finish(e,s.id)} className="space-y-3 border-t border-teal-200 bg-white p-3">
        <h3 className="font-semibold text-slate-900">Encerrar este expediente</h3>
        <p className="text-xs text-slate-600">KM inicial: {Number(s.initial_mileage).toLocaleString('pt-BR')}. O encerramento não exige finalizar cada serviço.</p>
        <div className="flex flex-wrap items-end gap-3">
         <label className="text-sm">KM final<input name="km" type="number" step="0.1" min={s.initial_mileage} required className={input}/></label>
         <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">Encerrar expediente</button>
        </div>
       </form>}
      </div>;
     })}
    </div>
    {totalPages>1&&<nav aria-label="Páginas de expedientes" className="mt-4 flex flex-wrap items-center justify-center gap-2"><button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Anterior</button>{Array.from({length:totalPages},(_,i)=><button key={i} type="button" aria-current={currentPage===i+1?'page':undefined} onClick={()=>setPage(i+1)} className={currentPage===i+1?'rounded-lg bg-teal-700 px-3 py-2 text-sm text-white':'rounded-lg border px-3 py-2 text-sm'}>{i+1}</button>)}<button type="button" disabled={currentPage===totalPages} onClick={()=>setPage(currentPage+1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Próxima</button></nav>}
   </section>

  </>}
 </main>;
}