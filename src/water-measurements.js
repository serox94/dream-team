import {body,fail,text,number,date} from './validation.js';
export async function waterMeasurements(request,env,active,id=null){
 const tripId=new URL(request.url).searchParams.get('tripId');
 if(!tripId)fail('Wymagany tripId.');
 const trip=await env.DB.prepare('SELECT id,lake_id FROM trips WHERE id=?').bind(tripId).first();
 if(!trip?.lake_id)fail('Nie znaleziono wyjazdu lub łowiska.',404);
 if(request.method==='GET')return {ok:true,measurements:(await env.DB.prepare('SELECT id,trip_id tripId,lake_id lakeId,temperature_c temperatureC,measured_at measuredAt,source,depth_m depthM,note,revision,updated_at updatedAt FROM water_measurements WHERE trip_id=? ORDER BY measured_at DESC,id').bind(tripId).all()).results};
 if(!active?.account)fail('Wymagane logowanie indywidualne.',403);
 if(!['POST','PUT'].includes(request.method))fail('Niedozwolona metoda.',405);
 const x=await body(request),temperature=number(x.temperatureC,'Temperatura wody',0,40,false),measured=date(x.measuredAt,'Pomiar',false);
 if(Date.parse(measured)>Date.now()+300000)fail('Pomiar nie może pochodzić z przyszłości.');
 if((temperature<2||temperature>32)&&x.confirmExtreme!==true)fail('Nietypowa temperatura wody — sprawdź odczyt i potwierdź.',422,'WATER_EXTREME_CONFIRM');
 const source=text(x.source,'Źródło',30,true);if(!['deeper','thermometer','other'].includes(source))fail('Nieprawidłowe źródło.');
 const depth=number(x.depthM??0,'Głębokość pomiaru',0,100,false),note=text(x.note,'Notatka',2000),mutation=text(x.mutationId,'Klucz zapisu',100,true);
 const old=await env.DB.prepare('SELECT id,trip_id FROM water_measurements WHERE mutation_id=?').bind(mutation).first();
 if(old){if(old.trip_id!==tripId)fail('Klucz należy do innego wyjazdu.',409);return {ok:true,id:old.id,alreadyApplied:true};}
 if(id){
  if(!Number.isInteger(x.revision)||x.revision<1)fail('Wymagana wersja pomiaru.',400);
  const r=await env.DB.prepare('UPDATE water_measurements SET temperature_c=?,measured_at=?,source=?,depth_m=?,note=?,mutation_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND trip_id=? AND revision=?').bind(temperature,measured,source,depth,note,mutation,id,tripId,x.revision).run();
  if(!r.meta.changes)fail('Pomiar zmieniono na innym urządzeniu. Odśwież historię.',409,'WATER_CONFLICT');
 }else{id=crypto.randomUUID();await env.DB.prepare('INSERT INTO water_measurements(id,trip_id,lake_id,temperature_c,measured_at,source,depth_m,note,created_by,mutation_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,tripId,trip.lake_id,temperature,measured,source,depth,note,active.account.id,mutation).run();}
 return {ok:true,id};
}
