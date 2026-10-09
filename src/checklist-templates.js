import {fail,text,number,body} from './validation.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
function listItems(env,id){return all(env,'SELECT id,category,label,assigned_to assignedTo,quantity,notes,sort_order sortOrder FROM checklist_template_items WHERE template_id=? ORDER BY sort_order,id',id);}
async function normalizeItems(env,items){
 if(!Array.isArray(items)||items.length>300)fail('Szablon może zawierać najwyżej 300 pozycji.');
 const categories=await all(env,'SELECT name FROM checklist_categories WHERE active=1');
 const allowed=new Set(categories.map(x=>x.name.toLocaleLowerCase('pl'))),seen=new Set(),clean=[];
 for(const [i,row] of items.entries()){
  if(!row||typeof row!=='object'||Array.isArray(row))fail('Nieprawidłowa pozycja szablonu.');
  const category=text(row.category,'Kategoria',100,true),label=text(row.label,'Pozycja',200,true);
  if(!allowed.has(category.toLocaleLowerCase('pl')))fail('Wybierz aktywną kategorię checklisty.');
  const unique=`${category.trim().toLocaleLowerCase('pl')}|${label.trim().toLocaleLowerCase('pl')}`;
  if(seen.has(unique))continue;seen.add(unique);
  clean.push({category,label,assignedTo:text(row.assignedTo,'Przypisanie',100),quantity:text(row.quantity,'Ilość',100),notes:text(row.notes,'Notatka',2000),sortOrder:number(row.sortOrder??i,'Kolejność',0,100000,false)});
 }
 return clean;
}
export async function checklistTemplates(request,env,id,action){
 const method=request.method;
 if(!id&&method==='GET'){
  const templates=await all(env,'SELECT id,name,created_at createdAt,updated_at updatedAt FROM checklist_templates ORDER BY name');
  for(const template of templates)template.items=await listItems(env,template.id);
  return json({ok:true,templates});
 }
 if(!id&&method==='POST'){
  const input=await body(request),name=text(input.name,'Nazwa szablonu',100,true);
  if(await one(env,'SELECT id FROM checklist_templates WHERE name=?',name))fail('Szablon o tej nazwie już istnieje.',409);
  let items=input.items;
  if(input.fromTripId){
   const tripId=text(input.fromTripId,'Wyjazd',100,true);if(!await one(env,'SELECT id FROM trips WHERE id=?',tripId))fail('Nie znaleziono wyjazdu.',404);
   const filter=input.categories;if(filter&&!Array.isArray(filter))fail('Nieprawidłowe kategorie.');
   items=await all(env,'SELECT category,label,assigned_to assignedTo,quantity,notes,sort_order sortOrder FROM checklist_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY sort_order,id',tripId);
   if(filter)items=items.filter(item=>filter.includes(item.category));
  }
  const clean=await normalizeItems(env,items||[]);if(!clean.length)fail('Wybierz co najmniej jedną pozycję.');
  const templateId=crypto.randomUUID(),statements=[env.DB.prepare('INSERT INTO checklist_templates(id,name) VALUES(?,?)').bind(templateId,name)];
  for(const item of clean)statements.push(env.DB.prepare('INSERT INTO checklist_template_items(id,template_id,category,label,assigned_to,quantity,notes,sort_order) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),templateId,item.category,item.label,item.assignedTo,item.quantity,item.notes,item.sortOrder));
  await env.DB.batch(statements);return json({ok:true,id:templateId,count:clean.length},201);
 }
 if(!id||!await one(env,'SELECT id FROM checklist_templates WHERE id=?',id))fail('Nie znaleziono szablonu.',404);
 if(method==='DELETE'){
  await env.DB.batch([env.DB.prepare('DELETE FROM checklist_template_items WHERE template_id=?').bind(id),env.DB.prepare('DELETE FROM checklist_templates WHERE id=?').bind(id)]);
  return json({ok:true});
 }
 if(method==='PUT'){
  const input=await body(request),name=text(input.name,'Nazwa szablonu',100,true);
  if(await one(env,'SELECT id FROM checklist_templates WHERE name=? AND id<>?',name,id))fail('Szablon o tej nazwie już istnieje.',409);
  const clean=await normalizeItems(env,input.items);
  const statements=[env.DB.prepare('UPDATE checklist_templates SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,id),env.DB.prepare('DELETE FROM checklist_template_items WHERE template_id=?').bind(id)];
  for(const item of clean)statements.push(env.DB.prepare('INSERT INTO checklist_template_items(id,template_id,category,label,assigned_to,quantity,notes,sort_order) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,item.category,item.label,item.assignedTo,item.quantity,item.notes,item.sortOrder));
  await env.DB.batch(statements);return json({ok:true,count:clean.length});
 }
 return json({ok:false,error:'Nie znaleziono endpointu.'},404);
}
export async function applyChecklistTemplates(request,env,tripId){
 if(!await one(env,'SELECT id FROM trips WHERE id=?',tripId))fail('Nie znaleziono wyjazdu.',404);
 const input=await body(request),ids=input.templateIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>10||ids.some(id=>typeof id!=='string'))fail('Wybierz od 1 do 10 szablonów.');
 if(input.categories&&!Array.isArray(input.categories))fail('Nieprawidłowe kategorie.');
 const chosen=[...new Set(ids)],statements=[];
 for(const id of chosen){
  const template=await one(env,'SELECT id FROM checklist_templates WHERE id=?',id);if(!template)fail('Nie znaleziono wybranego szablonu.',404);
  for(const item of await listItems(env,id)){
   if(input.categories&&!input.categories.includes(item.category))continue;
   if(!await one(env,'SELECT id FROM checklist_categories WHERE name=? AND active=1',item.category))continue;
   statements.push(env.DB.prepare(`INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed,quantity,notes,sort_order)
     SELECT ?,?,?,?,0,?,?,? WHERE NOT EXISTS(SELECT 1 FROM checklist_items WHERE trip_id=? AND deleted_at IS NULL AND trim(category)=trim(?) COLLATE NOCASE AND trim(label)=trim(?) COLLATE NOCASE)`).bind(tripId,item.category,item.label,item.assignedTo,item.quantity,item.notes,item.sortOrder,tripId,item.category,item.label));
  }
 }
 const results=statements.length?await env.DB.batch(statements):[];
 return json({ok:true,added:results.reduce((sum,r)=>sum+(r.meta?.changes||0),0),considered:statements.length});
}
