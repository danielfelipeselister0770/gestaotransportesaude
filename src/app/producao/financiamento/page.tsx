'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, Download, FileCheck2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Production = { id:string; production_date:string; quantity:number; production_type:string; status:string; export_batch_id:string|null; request_id:string|null; procedure:{code:string;name:string}|null; request:{financing_distance_km:number|null;patient:{name:string}|null}|null };
type Rule = { treatment_type:string; procedure_code:string; min_distance_km:number; max_distance_km:number|null; round_trip_value:number; valid_from:string; valid_to:string|null; legal_basis:string };
type Batch = { id:string; competence:string; production_type:string; status:string; record_count:number };

export default function FinanciamentoPage(){
 const supabase=createClient();
 const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
 const [rows,setRows]=useState<Production[]>([]);
 const [historyRows,setHistoryRows]=useState<Production[]>([]);
 const [yearRows,setYearRows]=useState<Production[]>([]);
 const [batches,setBatches]=useState<Batch[]>([]);
 const [rules,setRules]=useState<Rule[]>([]);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');

 useEffect(()=>{(async()=>{
  setLoading(true);setMessage('');
  const start=`${month}-01`;const d=new Date(`${month}-01T00:00:00`);d.setMonth(d.getMonth()+1);const end=d.toISOString().slice(0,10);const competence=month.replace('-','');
  const historyDate=new Date(`${month}-01T00:00:00`);historyDate.setMonth(historyDate.getMonth()-5);const historyStart=historyDate.toISOString().slice(0,10);
  const selectedYear=month.slice(0,4);const yearStart=`${selectedYear}-01-01`;const yearEnd=`${Number(selectedYear)+1}-01-01`;
  const [p,b,r,h,y]=await Promise.all([
   supabase.from('sus_production').select('id,production_date,quantity,production_type,status,export_batch_id,request_id,procedure:sigtap_procedures(code,name),request:transport_requests(financing_distance_km,patient:patients(name))').gte('production_date',start).lt('production_date',end),
   supabase.from('sus_export_batches').select('id,competence,production_type,status,record_count').eq('competence',competence),
   supabase.from('sus_transport_financing_rules').select('treatment_type,procedure_code,min_distance_km,max_distance_km,round_trip_value,valid_from,valid_to,legal_basis').eq('active',true),
   supabase.from('sus_production').select('id,production_date,quantity,production_type,status,export_batch_id,request_id,procedure:sigtap_procedures(code,name),request:transport_requests(financing_distance_km,patient:patients(name))').gte('production_date',historyStart).lt('production_date',end),
   supabase.from('sus_production').select('id,production_date,quantity,production_type,status,export_batch_id,request_id,procedure:sigtap_procedures(code,name),request:transport_requests(financing_distance_km,patient:patients(name))').gte('production_date',yearStart).lt('production_date',yearEnd)
  ]);
  if(p.error||b.error||r.error||h.error||y.error){setMessage(p.error?.message||b.error?.message||r.error?.message||h.error?.message||y.error?.message||'Erro ao carregar painel.');setLoading(false);return}
  setRows((p.data??[]) as unknown as Production[]);setBatches((b.data??[]) as Batch[]);setRules((r.data??[]) as Rule[]);setHistoryRows((h.data??[]) as unknown as Production[]);setYearRows((y.data??[]) as unknown as Production[]);setLoading(false);
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
 const classified=detailed.map(item=>{const ready=!!item.rule&&['VALIDATED','EXPORTED'].includes(item.row.status);const target=['0803010150','0803010168'].includes(item.row.procedure?.code||'');const outside=!target||(!item.rule&&item.distance>0&&item.row.production_type==='BPA_I');return {...item,classification:ready?'READY':outside?'OUTSIDE':'FIX'};});
 const eligible=classified.filter(x=>x.rule);
 const estimatedPotential=eligible.reduce((sum,x)=>sum+x.value,0);
 const estimatedReady=eligible.filter(x=>['VALIDATED','EXPORTED'].includes(x.row.status)).reduce((sum,x)=>sum+x.value,0);
 const missingDistance=rows.filter(row=>['0803010150','0803010168'].includes(row.procedure?.code||'')&&!row.request?.financing_distance_km).length;
 const readyCount=classified.filter(x=>x.classification==='READY').length,fixCount=classified.filter(x=>x.classification==='FIX').length,outsideCount=classified.filter(x=>x.classification==='OUTSIDE').length;
 const recoverablePotential=classified.filter(x=>x.classification==='FIX'&&x.rule).reduce((sum,x)=>sum+x.value,0);
 const opportunityLoss=useMemo(()=>{
  const target=classified.filter(x=>['0803010150','0803010168'].includes(x.row.procedure?.code||'')&&x.classification!=='READY');
  const groups=[
   {key:'DISTANCE',label:'Sem distância de referência',test:(x:any)=>!x.distance},
   {key:'LINK',label:'Sem solicitação vinculada',test:(x:any)=>!x.row.request_id},
   {key:'BPA',label:'Produção fora do BPA-I',test:(x:any)=>x.row.production_type!=='BPA_I'},
   {key:'DRAFT',label:'Aguardando validação',test:(x:any)=>!!x.rule&&x.row.status==='DRAFT'},
   {key:'RULE',label:'Fora da faixa/vigência',test:(x:any)=>!!x.distance&&x.row.production_type==='BPA_I'&&!x.rule}
  ];
  return groups.map(g=>{const items=target.filter(g.test);return {...g,count:items.length,measurable:items.filter(x=>x.rule).reduce((s,x)=>s+x.value,0)};}).filter(g=>g.count>0);
 },[classified]);
 const measurableLoss=opportunityLoss.reduce((s,g)=>s+g.measurable,0);

 const treatmentSummary=['HEMODIALYSIS','RADIOTHERAPY'].map(type=>{
  const items=classified.filter(x=>x.rule?.treatment_type===type);
  const ready=items.filter(x=>x.classification==='READY');
  const pending=items.filter(x=>x.classification==='FIX');
  return {type,label:type==='HEMODIALYSIS'?'Hemodiálise':'Radioterapia',records:items.length,potential:items.reduce((s,x)=>s+x.value,0),readyValue:ready.reduce((s,x)=>s+x.value,0),pendingValue:pending.reduce((s,x)=>s+x.value,0),ready:ready.length,pending:pending.length};
 });

 const monthlyHistory=useMemo(()=>Array.from({length:6},(_,i)=>{
  const base=new Date(`${month}-01T00:00:00`);base.setMonth(base.getMonth()-(5-i));const key=base.toISOString().slice(0,7);
  const items=historyRows.filter(row=>row.production_date.startsWith(key)).map(row=>{const distance=Number(row.request?.financing_distance_km||0);const rule=rules.find(rule=>rule.procedure_code===row.procedure?.code&&row.production_type==='BPA_I'&&row.production_date>=rule.valid_from&&(!rule.valid_to||row.production_date<=rule.valid_to)&&distance>=Number(rule.min_distance_km)&&(!rule.max_distance_km||distance<=Number(rule.max_distance_km)));return {row,value:rule?Number(row.quantity||0)*Number(rule.round_trip_value):0,rule};}).filter(x=>x.rule);
  return {key,label:base.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),potential:items.reduce((s,x)=>s+x.value,0),ready:items.filter(x=>['VALIDATED','EXPORTED'].includes(x.row.status)).reduce((s,x)=>s+x.value,0),pending:items.filter(x=>x.row.status==='DRAFT').reduce((s,x)=>s+x.value,0)};
 }),[historyRows,rules,month]);
 const maxHistory=Math.max(1,...monthlyHistory.map(x=>x.potential));
 const annualSummary=useMemo(()=>{
  const selectedMonthNumber=Number(month.slice(5,7));
  const items=yearRows.map(row=>{const distance=Number(row.request?.financing_distance_km||0);const rule=rules.find(rule=>rule.procedure_code===row.procedure?.code&&row.production_type==='BPA_I'&&row.production_date>=rule.valid_from&&(!rule.valid_to||row.production_date<=rule.valid_to)&&distance>=Number(rule.min_distance_km)&&(!rule.max_distance_km||distance<=Number(rule.max_distance_km)));return {row,value:rule?Number(row.quantity||0)*Number(rule.round_trip_value):0,rule};}).filter(x=>x.rule&&Number(x.row.production_date.slice(5,7))<=selectedMonthNumber);
  const total=items.reduce((s,x)=>s+x.value,0);const ready=items.filter(x=>['VALIDATED','EXPORTED'].includes(x.row.status)).reduce((s,x)=>s+x.value,0);
  const months=Array.from({length:selectedMonthNumber},(_,i)=>{const key=`${month.slice(0,4)}-${String(i+1).padStart(2,'0')}`;return {key,value:items.filter(x=>x.row.production_date.startsWith(key)).reduce((s,x)=>s+x.value,0)};});
  const activeMonths=Math.max(1,months.filter(x=>x.value>0).length);const average=total/activeMonths;const best=months.reduce((a,b)=>b.value>a.value?b:a,{key:'',value:0});
  return {total,ready,average,projection:average*12,best,activeMonths};
 },[yearRows,rules,month]);

 function exportCsv(){
  const esc=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
  const header=['Competência','Data','Paciente','Código','Procedimento','Tratamento','Tipo produção','Status','Distância km','Faixa km','Valor faixa ida/volta','Quantidade','Potencial estimado','Classificação','Pendência','Base legal'];
  const data=classified.map(item=>[month,item.row.production_date,item.patient,item.row.procedure?.code||'',item.row.procedure?.name||'',item.rule?.treatment_type==='HEMODIALYSIS'?'Hemodiálise':item.rule?.treatment_type==='RADIOTHERAPY'?'Radioterapia':'',item.row.production_type,item.row.status,item.distance||'',item.rule?`${item.rule.min_distance_km}-${item.rule.max_distance_km??'+'}`:'',item.rule?.round_trip_value??'',item.row.quantity,item.rule?item.value:'',item.classification==='READY'?'Pronto para BPA-I':item.classification==='FIX'?'Corrigir pendência':'Fora da regra',item.issue,item.rule?.legal_basis||'']);
  const note=['AVISO','Valores são estimativas de potencial e não representam recurso aprovado, processado ou transferido pelo SUS.'];
  const csv='\uFEFF'+[note,[],header,...data].map(row=>row.map(esc).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`financiamento-transporte-sus-${month}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }

 const stats=useMemo(()=>{
  const total=rows.reduce((s,r)=>s+Number(r.quantity||0),0);
  const validated=rows.filter(r=>r.status==='VALIDATED');
  const exported=rows.filter(r=>r.status==='EXPORTED');
  const draft=rows.filter(r=>r.status==='DRAFT');
  const withoutTransport=rows.filter(r=>!r.request_id);
  const bpaI=rows.filter(r=>r.production_type==='BPA_I');
  return {total,validated:validated.length,exported:exported.length,draft:draft.length,withoutTransport:withoutTransport.length,bpaI:bpaI.length,ready:validated.filter(r=>!r.export_batch_id).length};
 },[rows]);

 return <main className="min-h-screen"><section className="p-4 md:p-8"><div className="mx-auto max-w-7xl">
  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Produção SUS</div><h1 className="text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Painel de Financiamento do Transporte SUS</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Acompanhamento operacional da produção relacionada ao transporte. Valores financeiros só serão exibidos quando houver regra oficial parametrizada.</p></div><div className="flex flex-wrap gap-2"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"/><button type="button" onClick={exportCsv} disabled={loading||classified.length===0} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16}/>Exportar CSV</button><Link href="/producao" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Produção</Link></div></div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Potencial identificado</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{estimatedPotential.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">{eligible.length} registro(s) enquadrados</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Potencial validado/exportado</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{estimatedReady.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">exclui registros ainda em rascunho</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Elegíveis identificados</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{eligible.length}</div><div className="text-xs text-slate-500">procedimento + BPA-I + vigência + distância</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Falta distância</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{missingDistance}</div><div className="text-xs text-slate-500">tratamentos-alvo sem distância de referência</div></div>
   </div>
   <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Status label="Pronto para BPA-I" value={readyCount}/><Status label="Corrigir pendência" value={fixCount}/><Status label="Fora da regra" value={outsideCount}/><div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-sm text-blue-700">Potencial recuperável</div><div className="mt-1 text-xl font-bold text-blue-950">{recoverablePotential.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="mt-1 text-xs text-blue-700">somente valores já calculáveis</div></div></div>
   <div className="mb-6 grid gap-4 lg:grid-cols-3">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Produção BPA-I</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{stats.bpaI}</div><div className="text-xs text-slate-500">registros classificados como BPA-I</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Sem solicitação de transporte vinculada</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{stats.withoutTransport}</div><div className="text-xs text-slate-500">revisar quando o vínculo for necessário</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Lotes da competência</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{batches.length}</div><div className="text-xs text-slate-500">{batches.filter(b=>b.status==='OPEN').length} abertos · {batches.filter(b=>b.status==='EXPORTED').length} exportados</div></div>
   </div>
   <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 font-semibold text-amber-950"><AlertTriangle size={18}/>Perda de oportunidade / pendências</div><p className="mt-1 text-sm text-amber-800">Mostra onde o potencial pode estar travado. Só há valor em R$ quando os dados já permitem cálculo seguro.</p></div><div className="text-left md:text-right"><div className="text-xs text-amber-700">Potencial calculável travado</div><div className="text-xl font-bold text-amber-950">{measurableLoss.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div></div>{opportunityLoss.length===0?<div className="mt-4 text-sm text-amber-900">Nenhuma pendência de oportunidade identificada na competência.</div>:<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{opportunityLoss.map(g=><div key={g.key} className="rounded-lg border border-amber-200 bg-white p-4"><div className="text-sm font-medium text-slate-900">{g.label}</div><div className="mt-1 text-2xl font-bold">{g.count}</div><div className="text-xs text-slate-500">{g.measurable>0?`${g.measurable.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} calculável(is) travado(s)`:'Valor ainda não mensurável'}</div></div>)}</div>}</div>
   <div className="mb-6"><div className="mb-3"><h2 className="font-semibold text-slate-900">Resumo anual {month.slice(0,4)}</h2><p className="text-sm text-slate-500">Acumulado até a competência selecionada. A projeção anual usa a média dos meses que já possuem potencial calculado.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Potencial acumulado</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{annualSummary.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">até {month}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Acumulado pronto</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{annualSummary.ready.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">validado/exportado internamente</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Média mensal calculável</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{annualSummary.average.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-slate-500">{annualSummary.activeMonths} mês(es) com potencial</div></div><div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm"><div className="text-sm text-violet-700">Projeção anual estimada</div><div className="mt-2 text-2xl font-bold tracking-tight text-violet-950">{annualSummary.projection.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-violet-700">não representa repasse garantido</div></div></div>{annualSummary.best.value>0&&<div className="mt-3 text-sm text-slate-600">Melhor competência no ano: <b>{annualSummary.best.key}</b> · {annualSummary.best.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} de potencial estimado.</div>}</div>
   <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5"><h2 className="font-semibold text-slate-950">Evolução do financiamento — 6 meses</h2><p className="text-sm text-slate-500">Histórico estimado pelas mesmas regras do painel. Não representa valor efetivamente transferido.</p></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{monthlyHistory.map(m=><div key={m.key} className="flex min-w-0 flex-col"><div className="flex h-32 items-end justify-center rounded-xl border border-slate-100 bg-slate-50 p-2"><div className="w-full max-w-[3rem] rounded-t-lg bg-teal-700" style={{height:`${Math.max(m.potential?8:0,(m.potential/maxHistory)*100)}%`}}/></div><div className="mt-2 text-center text-xs font-medium capitalize">{m.label}</div><div className="text-center text-sm font-bold">{m.potential.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="mt-1 text-center text-[11px] text-emerald-700">Pronto {m.ready.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-center text-[11px] text-amber-700">Pendente {m.pending.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div>)}</div></div>
   <div className="mb-6"><div className="mb-3"><h2 className="font-semibold text-slate-900">Potencial por tratamento</h2><p className="text-sm text-slate-500">Separação dos registros que já possuem enquadramento calculável nas regras parametrizadas.</p></div><div className="grid gap-4 lg:grid-cols-2">{treatmentSummary.map(t=><div key={t.type} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="font-semibold">{t.label}</div><div className="text-xs text-slate-500">{t.records} registro(s) enquadrado(s)</div></div><div className="text-right"><div className="text-xs text-slate-500">Potencial</div><div className="text-xl font-bold">{t.potential.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs text-emerald-700">Pronto</div><div className="font-semibold text-emerald-950">{t.readyValue.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-emerald-700">{t.ready} registro(s)</div></div><div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-700">Pendente calculável</div><div className="font-semibold text-amber-950">{t.pendingValue.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div className="text-xs text-amber-700">{t.pending} registro(s)</div></div></div></div>)}</div></div>
   <div className="mb-6 overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Conferência do potencial financeiro</h2><p className="mt-1 text-sm text-slate-500">Registro, paciente, enquadramento e pendência encontrada.</p></div><div className="divide-y">{classified.map(item=><div key={item.row.id} className="grid gap-2 p-4 md:grid-cols-[1.3fr_1fr_1fr_1.5fr_1fr]"><div><b>{item.patient}</b><div className="text-xs text-slate-500">{item.row.procedure?.code||'Sem procedimento'}</div></div><div className="text-sm">{item.distance?item.distance.toLocaleString('pt-BR')+' km':'Sem distância'}</div><div className="text-sm">{item.row.status}</div><div className="text-sm"><div>{item.issue||'Enquadrado na regra parametrizada'}</div><div className="mt-2 flex flex-wrap gap-2">{item.row.request_id&&<Link href={`/solicitacoes?request=${item.row.request_id}`} className="rounded border px-2 py-1 text-xs font-medium">Abrir solicitação</Link>}<Link href={`/producao?production=${item.row.id}`} className="rounded border px-2 py-1 text-xs font-medium">Abrir produção</Link></div></div><div className="text-sm font-semibold md:text-right">{item.rule?item.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}</div></div>)}</div></div>
   <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={18}/>Fila de pendências</div><div className="mt-3 space-y-2 text-sm text-amber-900">{detailed.filter(x=>x.issue).length===0?<div>Nenhuma pendência identificada.</div>:detailed.filter(x=>x.issue).slice(0,10).map(x=><div key={x.row.id}>• <b>{x.patient}</b>: {x.issue}</div>)}</div></div>
   <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Prontidão da competência</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Status label="Rascunhos" value={stats.draft}/><Status label="Validados" value={stats.validated}/><Status label="Exportados" value={stats.exported}/></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/producao/lotes" className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Gerenciar lotes BPA/TFD</Link><Link href="/producao/sigtap/importar" className="rounded-lg border px-4 py-2 text-sm font-medium">Conferir SIGTAP</Link></div></div>
  </>}
 </div></section></main>
}
function Card({icon:Icon,label,value,detail}:{icon:any;label:string;value:number;detail:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={20}/></div><div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-sm font-semibold text-slate-800">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>}
function Status({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>}
