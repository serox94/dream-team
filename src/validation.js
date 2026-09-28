export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new InputError(message, status); };
export const has = (object, key) => Object.hasOwn(object, key);
export const pick = (object, key, fallback) => has(object, key) ? object[key] : fallback;
export function text(value, label, max = 500, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') fail(`${label}: wymagany tekst.`);
  const v = value.trim();
  if (required && !v) fail(`${label}: pole jest wymagane.`);
  if (v.length > max) fail(`${label}: maksymalnie ${max} znaków.`);
  return v || null;
}
export function number(value, label, min, max, nullable = true) {
  if (value == null || value === '') {
    if (nullable) return null;
    fail(`${label}: pole jest wymagane.`);
  }
  if (!['number','string'].includes(typeof value)) fail(`${label}: nieprawidłowa liczba.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${label}: wartość od ${min} do ${max}.`);
  return n;
}
export function date(value, label, nullable = true) {
  if (value == null || value === '') {
    if (nullable) return null;
    fail(`${label}: pole jest wymagane.`);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label}: podaj datę ze strefą czasową.`);
  const [year,month,day]=value.slice(0,10).split('-').map(Number);
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)fail(`${label}: nieprawidłowy dzień.`);
  return new Date(value).toISOString();
}
export function webUrl(value, label) {
  const v = text(value, label, 2000);
  if (!v) return null;
  if (v.startsWith('/assets/') && !v.includes('..')) return v;
  try { if (['http:','https:'].includes(new URL(v).protocol)) return v; } catch {}
  fail(`${label}: dozwolony jest adres http lub https.`);
}
export function facts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Nieprawidłowe dane łowiska.');
  if (JSON.stringify(value).length > 40000) fail('Dane łowiska są zbyt duże.');
  for (const key of ['mapImage','mapImageLarge','mapUrl','source','officialSource']) if (value[key]) webUrl(value[key], key);
  if (value.timeZone) { try { new Intl.DateTimeFormat('pl', {timeZone:value.timeZone}); } catch { fail('Nieprawidłowa strefa czasowa.'); } }
  if (value.contentPack && !/^[a-z0-9-]+$/.test(value.contentPack)) fail('Nieprawidłowy pakiet treści.');
  return value;
}
export async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('Wymagany Content-Type: application/json.', 415);
  if (Number(request.headers.get('content-length')) > 65536) fail('Żądanie jest zbyt duże.', 413);
  const raw = await request.text();
  if (raw.length > 65536) fail('Żądanie jest zbyt duże.', 413);
  let x;
  try { x = JSON.parse(raw); } catch { fail('Nieprawidłowy JSON.'); }
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail('Wymagany obiekt JSON.');
  return x;
}
