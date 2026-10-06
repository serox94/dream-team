import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTripAdvice} from '../src/trip-advice.js';

// Two pre-existing production profiles represented by their persisted lake/trip fields.
const cases=[
  {name:'Wygonin',trip:{id:'poland-2027',name:'Wygonin 2027',start:'2027-05-01',end:'2027-05-08',country:'Polska',facts:{pegBottom:'mozaika twardości'}},lake:{name:'Jezioro Wygonin',country:'Polska',sourceUrl:'https://bookingfish.eu/lowiska/jezioro-wygonin',facts:{depth:'1–24.8 m',rods:'maks. 4 wędki',baitBoat:'dozwolone modele RC'}}},
  {name:'Miłoszewskie',trip:{id:'miloszewskie-2027',name:'Miłoszewskie 2027',start:null,end:null,peg:'Stanowisko 33',country:'Polska',facts:{pegBottom:'mozaika twardości i przejścia',pegPrimaryDepthWindow:'6–8 m'}},lake:{name:'Jezioro Miłoszewskie',country:'Polska',sourceUrl:'https://miloszewskie.pl/',facts:{depth:'średnio 7,2 m · maks. 28 m',rods:'maks. 2 wędki',baitBoat:'wywózka do połowy odległości akwenu'}}}
];
for(const item of cases)test(`Porady dla istniejącego profilu: ${item.name}`,()=>{
  const result=generateTripAdvice(item);
  assert.equal(result.tripId,item.trip.id);
  assert.ok(result.facts.some(f=>f.field==='depth'));
  assert.ok(result.facts.some(f=>f.field==='rods'));
  assert.ok(result.suggestions.some(x=>x.name==='Plan B'));
  assert.ok(result.suggestions.some(x=>x.name==='Prezentacja i rig'));
  assert.ok(result.missing.includes('regulamin'));
  assert.ok(result.suggestions.at(-1).value.includes('Regulamin niezweryfikowany'));
});
test('Fixture: muł, zielsko, źródłowy zakaz łódki i prognoza',()=>{
  const result=generateTripAdvice({trip:{id:'fixture',name:'Test',start:'2027-06-01',end:'2027-06-08',facts:{}},lake:{name:'Woda',country:'Polska',facts:{depth:'3 m'}},researchedFacts:[
    {field:'bottom',value:'lekki muł',status:'potwierdzone',sourceName:'operator',url:'https://example.org'},
    {field:'weed',value:'gęste zielsko',status:'potwierdzone'},
    {field:'bait_boats',value:'łódki zanętowe zabronione',status:'potwierdzone'},
    {field:'rules',value:'Łódki zabronione',status:'potwierdzone'},
    {field:'rods',value:'2 wędki',status:'potwierdzone'}
  ],weather:{daily:{time:['2027-06-01'],temperature_2m_min:[8],temperature_2m_max:[12],wind_speed_10m_max:[12]}}});
  assert.equal(result.incomplete,false);
  assert.match(result.suggestions.find(x=>x.name==='Prezentacja i rig').value,/pop-up/);
  assert.match(result.suggestions.find(x=>x.name==='Ograniczenia').value,/zabronione/);
  assert.match(result.suggestions.find(x=>x.name==='Nęcenie i ilość').value,/kilka kulek/);
  assert.equal(result.facts.find(x=>x.field==='bottom').origin,'Research: operator');
});
test('Sprzeczne źródła nie dają pozornej pewności',()=>{
  const result=generateTripAdvice({trip:{id:'x',name:'X',facts:{}},lake:{name:'X',facts:{baitBoat:'dozwolona'}},researchedFacts:[{field:'bait_boats',value:'zabronione',status:'sprzeczne'}]});
  assert.ok(result.missing.some(x=>x.includes('sprzeczne źródła')));
  assert.ok(!result.facts.some(x=>x.field==='bait_boats'));
});
