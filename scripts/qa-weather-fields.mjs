// Read the user-visible expanded measurements, never stale text in skipped details layout.
import assert from 'node:assert/strict';
export const weatherFieldIds=['carp-pressure','carp-wind','carp-rain','carp-air','carp-window'];
export async function assertWeatherFields(page){
 await page.locator('#refresh-weather-btn:not([disabled])').waitFor({timeout:45000});
 const values={};
 for(const id of weatherFieldIds){
  const field=page.locator('#'+id);
  for(const panel of await page.locator('details:not([open])').filter({has:field}).all())await panel.locator(':scope > summary').click();
  await field.waitFor({state:'visible',timeout:10000});
  const text=(await field.innerText()).trim();
  assert.ok(text&&!['—','--'].includes(text),'WEATHER_FIELD_EMPTY:'+id+':'+JSON.stringify(text));
  assert.equal(text,(await field.textContent()).trim(),'WEATHER_RENDERED_TEXT_MISMATCH:'+id);
  values[id]=text;
 }
 return values;
}
