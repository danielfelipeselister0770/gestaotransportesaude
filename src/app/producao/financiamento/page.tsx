'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, FileCheck2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Production = { id:string; production_date:string; quantity:number; production_type:string; status:string; export_batch_id:string|null; request_id:string|null; procedure:{code:string;name:string}|null; request:{financing_distance_km:number|null;patient:{name:string}|null}|null };
type Rule = { treatment_type:string; procedure_code:string; min_distance_km:number; max_distance_km:number|null; round_trip_value:number; valid_from:string; valid_to:string|null; legal_basis:string };
type Batch = { id:string; competence:string; production_type:string; status:string; record_count:number };

export default function FinanciamentoPage(){
 const supabase=createClient();
 const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
 const [rows,setRows]=useState<Production[]>([]);
 const [batches,setBatches]=useState<Batch[]>([]);
 const [rules,setRules]=useState<Rule[]>([]);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');

 useEffect(()=>{(async()=>{
  setLoading(true);setMessage('');
  const start=`${month}-01`;const d=new Date(`${month}-01T00:00:00`);d.setMonth(d.getMonth()+1);const end=d.toISOString().slice(0,10);const competence=month.replace('-','');
  const [p,b,r]=await Promise.all([
   supabase.from('sus_production').select('id,production_date,quantity,production_type,status,export_batch_id,request_id,procedure:sigtap_procedures(code,name),request:transport_requests(financing_distance_km,patient:patients(name))').gte('production_date',start).lt('production_date',end),
   supabase.from('sus_export_batches').select('id,competence,production_type,status,record_count').eq('competence',competence),
   supabase.from('sus_transport_financing_rules').select('treatment_type,procedure_code,min_distance_km,max_distance_km,round_trip_value,valid_from,valid_to,legal_basis').eq('active',true)
  ]);
  if(p.error||b.error||r.error){setMessage(p.error?.message||b.error?.message||r.error?.message||'Erro ao carregar painel.');setLoading(false);return}
  setRows((p.data??[]) as unknown as Production[]);setBatches((b.data??[]) as Batch[]);setRules((r.data??[]) as Rule[]);setLoading(false);
 })()},[month]);

 const financing=useMemo(()=>rows.map(row=>{
  const distance=Number(row.request?.financing_distance_km||0);
  const rule=rules.find(rule=>rule.procedure_code===row.procedure?.code&&row.production_type==='BPA_I'&&row.production_date>=rule.valid_from&&(!rule.valid_to||row.production_date<=rule.valid_to)&&distance>=Number(rule.min_distance_km)&&(!rule.max_distance_km||distance<=Number(rule.max_distance_km)));
  return {row,distance,rule,value:rule?Number(row.quantity||0)*Number(rule.round_trip_value):0};
 }),[rows,rules]);
 const detailed=financing.map(item=>{
  const target=['0803010150','0803010168'].includes(item.row.procedure?.code||'');
  let issue='';
  if(!target) issue='Procedimento fora das regras parametrizadas';
  else if(!item.row.request_id) issue='Sem solicitação de transporte vinculada';
  else if(!item.distance) issue='Sem distância de referência SUS';
  else if(item.row.production_type!=='BPA_I') issue='Registro não classificado como BPA-I';
  else if(!item.rule) issue='Distância ou competência fora das faixas vigentes';
  else if(item.row.status==='DRAFT') issue='Elegível, mas ainda em rascunho';
  return {...item,issue,patient:item.row.request?.patient?.name||'Paciente não identificado'};
 });
 const eligible=detailed.filter(x=>x.rule);
 const estimatedPotential=eligible.reduce((sum,x)=>sum+x.value,0);
 const estimatedReady=eligible.filter(x=>['VALIDATED','EXPORTED'].includes(x.row.status)).reduce((sum,x)=>sum+x.value,0);
 const missingDistance=rows.filter(row=>['0803010150','0803010168'].includes(row.procedure?.code||'')&&!row.request?.financing_distance_km).length;

 const stats=useMemo(()=>{
  const total=rows.reduce((s,r)=>s+Number(r.quantity||0),0);
  const validated=rows.filter(r=>r.status==='VALIDATED');
  const exported=rows.filter(r=>r.status==='EXPORTED');
  const draft=rows.filter(r=>r.status==='DRAFT');
  const withoutTransport=rows.filter(r=>!r.request_id);
  const bpaI=rows.filter(r=>r.production_type==='BPA_I');
  return {total,validated:validated.length,exported:exported.length,draft:draft.length,withoutTransport:withoutTransport.length,bpaI:bpaI.length,ready:validated.filter(r=>!r.export_batch_id).length};
 },[rows]);

 return <main className="min-h-screen bg-slate-50"><section className="p-4 md:p-8"><div className="mx-auto max-w-7xl">
  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-sm font-medium text-slate-500">Produção SUS</div><h1 className="text-2xl font-bold text-slate-900">Painel de Financiamento do Transporte SUS</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Acompanhamento operacional da produção relacionada ao transporte. Valores financeiros só serão exibidos quando houver regra oficial parametrizada.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"/><Link href="/producao" className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">Produção</Link></div></div>
  {message&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}
  <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><div className="flex gap-2 font-semibold"><Banknote size={18}/>Estimativa potencial — não é valor aprovado ou transferido</div><p className="mt-1">O cálculo usa procedimento BPA-I, competência, distância de referência informada na solicitação e a faixa oficial parametrizada. O valor real depende do processamento e das regras do SUS.</p></div>
  {loading?<div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Carregando painel...</div>:<>
   <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Card icon={ClipboardList} label="Registros no período" value={rows.length} detail={`${stats.total} procedimentos/quantidades`}/>
    <Card icon={CheckCircle2} label="Validados sem lote" value={stats.ready} detail="prontos para organização em lote"/>
    <Card icon={FileCheck2} label="Exportados internamente" value={stats.exported} detail="marcados como exportados no sistema"/>
    <Card icon={AlertTriangle} label="Pendentes de validação" value={stats.draft} detail="registros ainda em rascunho"/>
   </div>
   <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Potencial identificado</div><div className="mt-2 text-2xl font-bold">{estimatedPotential.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">{eligible.length} registro(s) enquadrados</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Potencial validado/exportado</div><div className="mt-2 text-2xl font-bold">{estimatedReady.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">exclui registros ainda em rascunho</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Elegíveis identificados</div><div className="mt-2 text-2xl font-bold">{eligible.length}</div><div className="text-xs text-slate-500">procedimento + BPA-I + vigência + distância</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Falta distância</div><div className="mt-2 text-2xl font-bold">{missingDistance}</div><div className="text-xs text-slate-500">tratamentos-alvo sem distância de referência</div></div>
   </div>
   <div className="mb-6 grid gap-4 lg:grid-cols-3">
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Produção BPA-I</div><div className="mt-2 text-2xl font-bold">{stats.bpaI}</div><div className="text-xs text-slate-500">registros classificados como BPA-I</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Sem solicitação de transporte vinculada</div><div className="mt-2 text-2xl font-bold">{stats.withoutTransport}</div><div className="text-xs text-slate-500">revisar quando o vínculo for necessário</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Lotes da competência</div><div className="mt-2 text-2xl font-bold">{batches.length}</div><div className="text-xs text-slate-500">{batches.filter(b=>b.status==='OPEN').length} abertos · {batches.filter(b=>b.status==='EXPORTED').length} exportados</div></div>
   </div>
   <div className="mb-6 overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Conferência do potencial financeiro</h2><p className="mt-1 text-sm text-slate-500">Registro, paciente, enquadramento e pendência encontrada.</p></div><div className="divide-y">{detailed.map(item=><div key={item.row.id} className="grid gap-2 p-4 md:grid-cols-[1.3fr_1fr_1fr_1.5fr_1fr]"><div><b>{item.patient}</b><div className="text-xs text-slate-500">{item.row.procedure?.code||'Sem procedimento'}</div></div><div className="text-sm">{item.distance?item.distance.toLocaleString('pt-BR')+' km':'Sem distância'}</div><div className="text-sm">{item.row.status}</div><div className="text-sm"><div>{item.issue||'Enquadrado na regra parametrizada'}</div><div className="mt-2 flex flex-wrap gap-2">{item.row.request_id&&<Link href={`/solicitacoes?request=${item.row.request_id}`} className="rounded border px-2 py-1 text-xs font-medium">Abrir solicitação</Link>}<Link href={`/producao?production=${item.row.id}`} className="rounded border px-2 py-1 text-xs font-medium">Abrir produção</Link></div></div><div className="text-sm font-semibold md:text-right">{item.rule?item.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}</div></div>)}</div></div>
   <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={18}/>Fila de pendências</div><div className="mt-3 space-y-2 text-sm text-amber-900">{detailed.filter(x=>x.issue).length===0?<div>Nenhuma pendência identificada.</div>:detailed.filter(x=>x.issue).slice(0,10).map(x=><div key={x.row.id}>• <b>{x.patient}</b>: {x.issue}</div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Prontidão da competência</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Status label="Rascunhos" value={stats.draft}/><Status label="Validados" value={stats.validated}/><Status label="Exportados" value={stats.exported}/></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/producao/lotes" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Gerenciar lotes BPA/TFD</Link><Link href="/producao/sigtap/importar" className="rounded-lg border px-4 py-2 text-sm font-medium">Conferir SIGTAP</Link></div></div>
  </>}
 </div></section></main>
}
function Card({icon:Icon,label,value,detail}:{icon:any;label:string;value:number;detail:string}){return <div className="rounded-xl border bg-white p-5 shadow-sm"><Icon size={20} className="mb-3 text-slate-500"/><div className="text-2xl font-bold">{value}</div><div className="text-sm font-medium">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>}
function Status({label,value}:{label:string;value:number}){return <div className="rounded-lg bg-slate-50 p-4"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>}
