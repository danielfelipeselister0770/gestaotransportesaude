'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Search, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';
type Municipality = { id: string; name: string; active: boolean };
type HealthUnit = { id: string; name: string; cnes: string | null; municipality_id: string };
type LinkRow = {
  id: string; professional_id: string; municipality_id: string; health_unit_id: string;
  cbo: string | null; active: boolean; responsible_for_production: boolean;
  vinculation: string | null; vinculation_subtype: string | null; sus: boolean;
};
type Professional = {
  id: string; name: string; cns: string | null; active: boolean; municipality_id: string;
};

export default function ProfessionalsPage() {
  const supabase = createClient();
  const [items,setItems]=useState<Professional[]>([]);
  const [links,setLinks]=useState<LinkRow[]>([]);
  const [units,setUnits]=useState<HealthUnit[]>([]);
  const [municipalities,setMunicipalities]=useState<Municipality[]>([]);
  const [role,setRole]=useState<Role|null>(null);
  const [municipalityId,setMunicipalityId]=useState<string|null>(null);
  const [municipalityName,setMunicipalityName]=useState('');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState<'ALL'|'ACTIVE'|'INACTIVE'>('ALL');
  const [unitFilter,setUnitFilter]=useState('ALL');
  const [editing,setEditing]=useState<Professional|null>(null);
  const [editingLink,setEditingLink]=useState<LinkRow|null>(null);
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

    const [p,l,u]=await Promise.all([
      supabase.from('health_professionals').select('id,name,cns,active,municipality_id').order('name'),
      supabase.from('health_professional_links').select('id,professional_id,municipality_id,health_unit_id,cbo,active,responsible_for_production,vinculation,vinculation_subtype,sus').order('created_at'),
      supabase.from('health_units').select('id,name,cnes,municipality_id').eq('active',true).order('name')
    ]);
    if(p.error) setMessage('Erro ao carregar profissionais: '+p.error.message);
    else setItems((p.data??[]) as Professional[]);
    if(l.error) setMessage('Erro ao carregar vínculos: '+l.error.message);
    else setLinks((l.data??[]) as LinkRow[]);
    if(u.error) setMessage('Erro ao carregar estabelecimentos: '+u.error.message);
    else setUnits((u.data??[]) as HealthUnit[]);
    setLoading(false);
  }

  useEffect(()=>{loadData();},[]);

  const canManage=role==='ADMIN'||role==='GESTOR';

  function openNew(){setEditing(null);setEditingLink(null);setShowForm(true);setMessage('');}
  function openEdit(item:Professional, link?:LinkRow){setEditing(item);setEditingLink(link??null);setShowForm(true);setMessage('');}

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

    const duplicate=items.find(item=>item.id!==editing?.id&&item.municipality_id===selectedMunicipalityId&&cns&&item.cns===cns);
    if(duplicate){setMessage('Já existe um profissional com este CNS nesta prefeitura.');return;}

    const professionalPayload={
      name:String(form.get('name')??'').trim(),
      cns:cns||null,
      active:form.get('professional_active')==='on',
      municipality_id:selectedMunicipalityId
    };
    if(!professionalPayload.name){setMessage('Informe o nome do profissional.');return;}

    const healthUnitId=String(form.get('health_unit_id')??'')||null;
    if(healthUnitId && !cbo){setMessage('Informe o CBO do vínculo quando houver estabelecimento.');return;}

    setSaving(true);setMessage('');
    let professionalId=editing?.id;

    if(editing){
      const professionalResult=await supabase
        .from('health_professionals')
        .update(professionalPayload)
        .eq('id',editing.id);
      if(professionalResult.error){
        setMessage('Não foi possível salvar o profissional: '+professionalResult.error.message);
        setSaving(false);
        return;
      }
      professionalId=editing.id;
    } else {
      const professionalResult=await supabase
        .from('health_professionals')
        .insert(professionalPayload)
        .select('id')
        .single();
      if(professionalResult.error || !professionalResult.data){
        setMessage('Não foi possível salvar o profissional: '+(professionalResult.error?.message ?? 'ID não retornado.'));
        setSaving(false);
        return;
      }
      professionalId=professionalResult.data.id;
    }

    if(healthUnitId){
      const linkPayload={
        municipality_id:selectedMunicipalityId,
        professional_id:professionalId,
        health_unit_id:healthUnitId,
        cbo:cbo||null,
        active:form.get('link_active')==='on',
        responsible_for_production:form.get('responsible_for_production')==='on',
        vinculation:String(form.get('vinculation')??'').trim()||null,
        vinculation_subtype:String(form.get('vinculation_subtype')??'').trim()||null,
        sus:form.get('sus')==='on'
      };
      const linkResult=editingLink
        ? await supabase.from('health_professional_links').update(linkPayload).eq('id',editingLink.id)
        : await supabase.from('health_professional_links').insert(linkPayload);
      if(linkResult.error){setMessage('Profissional salvo, mas não foi possível salvar o vínculo: '+linkResult.error.message);setSaving(false);return;}
    } else if(editingLink){
      const linkResult=await supabase.from('health_professional_links').update({
        health_unit_id:editingLink.health_unit_id,
        cbo:editingLink.cbo,
        active:form.get('link_active')==='on',
        responsible_for_production:form.get('responsible_for_production')==='on',
        vinculation:String(form.get('vinculation')??'').trim()||null,
        vinculation_subtype:String(form.get('vinculation_subtype')??'').trim()||null,
        sus:form.get('sus')==='on'
      }).eq('id',editingLink.id);
      if(linkResult.error){setMessage('Profissional salvo, mas o vínculo não foi atualizado: '+linkResult.error.message);setSaving(false);return;}
    }

    setShowForm(false);setEditing(null);setEditingLink(null);
    setMessage(editing?'Profissional atualizado com sucesso.':'Profissional cadastrado com sucesso.');
    await loadData();
    setSaving(false);
  }

  const visibleUnits=role==='ADMIN' ? units : units.filter(u=>u.municipality_id===municipalityId);
  const filtered=items.filter(item=>{
    const q=search.toLowerCase();
    const myLinks=links.filter(l=>l.professional_id===item.id);
    const hit=item.name.toLowerCase().includes(q)
      || (item.cns??'').includes(q)
      || myLinks.some(l=>{
        const unit=units.find(u=>u.id===l.health_unit_id);
        return (l.cbo??'').includes(q) || (unit?.name??'').toLowerCase().includes(q) || (unit?.cnes??'').includes(q);
      });
    return hit&&(statusFilter==='ALL'||(statusFilter==='ACTIVE'?item.active:!item.active))&&(unitFilter==='ALL'||myLinks.some(l=>l.health_unit_id===unitFilter));
  });

  const counts={total:items.length,active:items.filter(x=>x.active).length,withCns:items.filter(x=>x.cns).length,activeLinks:links.filter(x=>x.active).length};

  return <main className="min-h-screen bg-slate-50">
<section className=" p-4 md:p-8"><div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Profissionais SUS</h1><p className="text-sm text-slate-500">{municipalityName||'Cadastro de profissionais e vínculos CNES'}</p></div>
        {canManage&&<button onClick={openNew} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Plus size={18}/> Novo profissional</button>}
      </div>
      {message&&<div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Profissionais" value={counts.total}/><Stat label="Ativos" value={counts.active}/><Stat label="Com CNS" value={counts.withCns}/><Stat label="Vínculos ativos" value={counts.activeLinks}/></div>
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_170px_260px]"><div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2"><Search size={18} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, CNS, CBO, CNES ou estabelecimento" className="w-full outline-none text-sm"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select><select value={unitFilter} onChange={e=>setUnitFilter(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="ALL">Todos os estabelecimentos</option>{visibleUnits.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>

      {showForm&&<form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">{editing?'Editar profissional':'Novo profissional'}</h2><p className="text-xs text-slate-500">O profissional é a pessoa; CBO e estabelecimento pertencem ao vínculo CNES.</p></div><button type="button" onClick={()=>setShowForm(false)}><X size={20}/></button></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {role==='ADMIN'&&<label className="text-sm sm:col-span-2 lg:col-span-4">Prefeitura<select name="municipality_id" required defaultValue={editing?.municipality_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Selecione a prefeitura</option>{municipalities.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
          <label className="text-sm sm:col-span-2 lg:col-span-3">Nome<input name="name" required defaultValue={editing?.name??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
          <label className="text-sm">CNS<input name="cns" inputMode="numeric" maxLength={15} defaultValue={editing?.cns??''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="15 dígitos"/></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input name="professional_active" type="checkbox" defaultChecked={editing?.active??true}/> Pessoa profissional ativa</label>

          <div className="sm:col-span-2 lg:col-span-4 border-t pt-4">
            <div className="mb-3 font-medium">Vínculo CNES {editingLink?'selecionado':'(opcional)'}</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm sm:col-span-2">Estabelecimento<select name="health_unit_id" defaultValue={editingLink?.health_unit_id??''} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Nenhum vínculo nesta operação</option>{visibleUnits.map(u=><option key={u.id} value={u.id}>{u.name}{u.cnes?' • CNES '+u.cnes:''}</option>)}</select></label>
              <label className="text-sm">CBO<input name="cbo" inputMode="numeric" maxLength={6} defaultValue={editingLink?.cbo??''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="6 dígitos"/></label>
              <label className="text-sm">Vinculação<input name="vinculation" defaultValue={editingLink?.vinculation??''} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Ex.: servidor"/></label>
              <label className="text-sm">Tipo/subtipo<input name="vinculation_subtype" defaultValue={editingLink?.vinculation_subtype??''} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
              <label className="flex items-center gap-2 text-sm"><input name="responsible_for_production" type="checkbox" defaultChecked={editingLink?.responsible_for_production??false}/> Responsável pela produção</label>
              <label className="flex items-center gap-2 text-sm"><input name="sus" type="checkbox" defaultChecked={editingLink?.sus??true}/> Vínculo SUS</label>
              <label className="flex items-center gap-2 text-sm"><input name="link_active" type="checkbox" defaultChecked={editingLink?.active??true}/> Vínculo ativo</label>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving?'Salvando...':'Salvar'}</button></div>
      </form>}

      <div className="overflow-hidden rounded-xl border bg-white">
        {loading?<div className="p-8 text-center text-sm text-slate-500">Carregando...</div>:filtered.length===0?<div className="p-8 text-center text-sm text-slate-500">Nenhum profissional cadastrado.</div>:
        <div className="divide-y">{filtered.map(item=>{
          const myLinks=links.filter(l=>l.professional_id===item.id);
          return <div key={item.id} className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><UserRound size={20}/></div><div>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">{item.name}<span className={'rounded-full px-2 py-0.5 text-xs font-medium '+(item.active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600')}>{item.active?'Pessoa ativa':'Pessoa inativa'}</span></div>
                <div className="mt-1 text-sm text-slate-500">{item.cns?'CNS '+item.cns:'CNS não informado'} • {myLinks.length} vínculo(s) CNES</div>
              </div></div>
              {canManage&&<button onClick={()=>openEdit(item,myLinks[0])} className="self-start rounded-lg border p-2 hover:bg-slate-50" title="Editar profissional"><Pencil size={16}/></button>}
            </div>
            {myLinks.length>0&&<div className="mt-4 space-y-2 pl-0 md:pl-12">{myLinks.map(link=>{const unit=units.find(u=>u.id===link.health_unit_id);return <div key={link.id} className="flex flex-col gap-2 rounded-lg border bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm"><div className="font-medium">{unit?.name??'Estabelecimento não encontrado'}{unit?.cnes?' • CNES '+unit.cnes:''}</div><div className="text-xs text-slate-500">{[link.cbo&&'CBO '+link.cbo,link.vinculation,link.vinculation_subtype,link.sus?'SUS':'Não SUS'].filter(Boolean).join(' • ')}</div></div>
              <div className="flex items-center gap-2"><span className={'rounded-full px-2 py-1 text-xs font-medium '+(link.active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600')}>{link.active?'Vínculo ativo':'Vínculo inativo'}</span>{link.responsible_for_production&&<span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Produção</span>}{canManage&&<button onClick={()=>openEdit(item,link)} className="rounded-lg border p-1.5 hover:bg-white" title="Editar vínculo"><Pencil size={14}/></button>}</div>
            </div>})}</div>}
          </div>
        })}</div>}
      </div>
    </div></section>
  </main>;
}

function Stat({label,value}:{label:string;value:number}){return <div className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>}
