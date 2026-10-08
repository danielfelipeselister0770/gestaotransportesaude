'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Row={id:string;municipality_id:string|null;target_user_id:string|null;actor_user_id:string|null;action:'CREATE'|'UPDATE'|'RESET_PASSWORD'|'DELETE';details:Record<string,unknown>;created_at:string};
type Profile={id:string;name:string};
type Municipality={id:string;name:string};
const labels={CREATE:'Criação',UPDATE:'Alteração',RESET_PASSWORD:'Redefinição de senha',DELETE:'Exclusão'} as const;

export default function HistoricoUsuariosPage(){
 const supabase=createClient();
 const [rows,setRows]=useState<Row[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[municipalities,setMunicipalities]=useState<Municipality[]>([]);
 const [action,setAction]=useState(''),[municipality,setMunicipality]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 useEffect(()=>{(async()=>{setLoading(true);const [h,p,m]=await Promise.all([
  supabase.from('user_admin_history').select('id,municipality_id,target_user_id,actor_user_id,action,details,created_at').order('created_at',{ascending:false}).limit(500),
  supabase.from('profiles').select('id,name'),supabase.from('municipalities').select('id,name').order('name')
 ]);if(h.error)setMessage('Não foi possível carregar o histórico: '+h.error.message);else setRows((h.data??[]) as Row[]);setProfiles((p.data??[]) as Profile[]);setMunicipalities((m.data??[]) as Municipality[]);setLoading(false);})();},[]);
 const names=useMemo(()=>Object.fromEntries(profiles.map(p=>[p.id,p.name])),[profiles]);
 const cities=useMemo(()=>Object.fromEntries(municipalities.map(m=>[m.id,m.name])),[municipalities]);
 const filtered=rows.filter(r=>{const target=names[r.target_user_id??'']??String(r.details?.name??'Usuário removido');const actor=names[r.actor_user_id??'']??'Usuário não disponível';return(!action||r.action===action)&&(!municipality||r.municipality_id===municipality)&&(!search||target.toLowerCase().includes(search.toLowerCase())||actor.toLowerCase().includes(search.toLowerCase()));});
 return <main className="min-h-screen p-5 lg:p-8"><div className="mx-auto max-w-6xl">
  <div className="mb-6 flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-700"><History size={16}/> Administração / Auditoria</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">Histórico administrativo</h1><p className="text-sm text-slate-500">Auditoria das ações realizadas sobre usuários do sistema.</p></div><Link href="/configuracoes" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-50"><ArrowLeft size={16}/> Configurações</Link></div>
  {message&&<div className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</div>}
  <section className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
   <input aria-label="Buscar usuário ou responsável" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuário ou responsável" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"/>
   <select aria-label="Filtrar por tipo de ação" value={action} onChange={e=>setAction(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"><option value="">Todas as ações</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="Filtrar por prefeitura" value={municipality} onChange={e=>setMunicipality(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"><option value="">Todas as prefeituras</option>{municipalities.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
  </section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading?<div role="status" className="p-6 text-sm text-slate-500">Carregando histórico...</div>:filtered.length===0?<div className="p-6 text-sm text-slate-500">Nenhum registro encontrado.</div>:<div className="overflow-x-auto"><table aria-label="Histórico de ações administrativas" className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-3">Data</th><th scope="col" className="p-3">Ação</th><th scope="col" className="p-3">Usuário afetado</th><th scope="col" className="p-3">Responsável</th><th scope="col" className="p-3">Prefeitura</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(r=><tr key={r.id} className="hover:bg-teal-50/40"><td className="whitespace-nowrap p-3">{new Date(r.created_at).toLocaleString('pt-BR')}</td><td className="p-3 font-medium">{labels[r.action]}</td><td className="p-3">{names[r.target_user_id??'']??String(r.details?.name??'Usuário removido')}</td><td className="p-3">{names[r.actor_user_id??'']??'Usuário não disponível'}</td><td className="p-3">{r.municipality_id?cities[r.municipality_id]??'Prefeitura não disponível':'Administração geral'}</td></tr>)}</tbody></table></div>}</section>
 </div></main>;
}