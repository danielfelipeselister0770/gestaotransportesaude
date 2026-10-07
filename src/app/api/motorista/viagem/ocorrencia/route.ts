import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request:Request){
 const server=createServerClient();const {data:claims}=await server.auth.getClaims();const userId=claims?.claims?.sub as string|undefined;
 if(!userId)return NextResponse.json({error:'Não autenticado.'},{status:401});
 const body=await request.json().catch(()=>null) as {tripId?:string;type?:string;description?:string}|null;
 const description=body?.description?.trim();if(!body?.tripId||!body.type||!description)return NextResponse.json({error:'Tipo e descrição são obrigatórios.'},{status:400});
 const allowed=['ACIDENTE','AVARIA','ATRASO','COMPORTAMENTO','OUTROS'];if(!allowed.includes(body.type))return NextResponse.json({error:'Tipo de ocorrência inválido.'},{status:400});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!key||!url)return NextResponse.json({error:'Configuração segura ausente.'},{status:500});
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:driver}=await admin.from('drivers').select('id,name,municipality_id').eq('profile_id',userId).maybeSingle();
 const {data:trip}=await admin.from('trips').select('id,driver_id,vehicle_id,municipality_id,status').eq('id',body.tripId).maybeSingle();
 if(!driver||!trip||trip.driver_id!==driver.id||trip.municipality_id!==driver.municipality_id)return NextResponse.json({error:'Viagem não pertence a você.'},{status:403});
 if(!['SCHEDULED','IN_PROGRESS'].includes(trip.status))return NextResponse.json({error:'Esta viagem já foi encerrada.'},{status:409});
 const {error}=await admin.from('occurrences').insert({vehicle_id:trip.vehicle_id,trip_id:trip.id,type:body.type,description,status:'OPEN',responsible:driver.name,created_by:userId,municipality_id:driver.municipality_id});
 if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ok:true});
}