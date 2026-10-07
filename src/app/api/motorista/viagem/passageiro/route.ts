import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request:Request){
 const server=createServerClient(); const {data:claims}=await server.auth.getClaims(); const userId=claims?.claims?.sub as string|undefined;
 if(!userId)return NextResponse.json({error:'Não autenticado.'},{status:401});
 const body=await request.json().catch(()=>null) as {tripId?:string;passengerId?:string;boardingStatus?:'BOARDED'|'NO_SHOW'}|null;
 if(!body?.tripId||!body.passengerId||!['BOARDED','NO_SHOW'].includes(body.boardingStatus??''))return NextResponse.json({error:'Dados inválidos.'},{status:400});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!key||!url)return NextResponse.json({error:'Configuração segura ausente.'},{status:500});
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:driver}=await admin.from('drivers').select('id,municipality_id').eq('profile_id',userId).maybeSingle();
 const {data:trip}=await admin.from('trips').select('id,driver_id,municipality_id,status').eq('id',body.tripId).maybeSingle();
 if(!driver||!trip||trip.driver_id!==driver.id||trip.municipality_id!==driver.municipality_id)return NextResponse.json({error:'Viagem não pertence a você.'},{status:403});
 if(trip.status!=='IN_PROGRESS')return NextResponse.json({error:'Inicie a viagem antes de registrar embarques.'},{status:409});
 const {data:passenger}=await admin.from('trip_passengers').select('id,trip_id,request_id').eq('id',body.passengerId).eq('trip_id',trip.id).maybeSingle();
 if(!passenger)return NextResponse.json({error:'Passageiro não pertence a esta viagem.'},{status:404});
 const {error}=await admin.from('trip_passengers').update({boarding_status:body.boardingStatus,boarded_at:body.boardingStatus==='BOARDED'?new Date().toISOString():null}).eq('id',passenger.id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 if(passenger.request_id&&body.boardingStatus==='NO_SHOW')await admin.from('transport_requests').update({status:'NO_SHOW'}).eq('id',passenger.request_id).eq('status','SCHEDULED');
 return NextResponse.json({ok:true});
}