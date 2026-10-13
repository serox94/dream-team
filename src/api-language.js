import base from '../public/locales/en.json' with {type:'json'};
import runtime from '../public/locales/runtime.en.json' with {type:'json'};
const dictionary={...base,...runtime};
const known=value=>Object.hasOwn(dictionary,value)?dictionary[value]:null;
export function apiMessage(value,lang){
 if(lang!=='en')return value;
 const direct=known(value);if(direct)return direct;
 const patterns=[
  [/^(.+): wymagany tekst\.$/,(_,label)=>`${apiMessage(label,lang)}: text is required.`],
  [/^(.+): pole jest wymagane\.$/,(_,label)=>`${apiMessage(label,lang)}: this field is required.`],
  [/^(.+): maksymalnie (\d+) znaków\.$/,(_,label,n)=>`${apiMessage(label,lang)}: at most ${n} characters.`],
  [/^(.+): nieprawidłowa liczba\.$/,(_,label)=>`${apiMessage(label,lang)}: invalid number.`],
  [/^(.+): wartość od ([\d.-]+) do ([\d.-]+)\.$/,(_,label,a,b)=>`${apiMessage(label,lang)}: value from ${a} to ${b}.`],
  [/^(.+): podaj datę ze strefą czasową\.$/,(_,label)=>`${apiMessage(label,lang)}: enter a date with a time zone.`],
  [/^(.+): nieprawidłowy dzień\.$/,(_,label)=>`${apiMessage(label,lang)}: invalid day.`],
  [/^(.+): dozwolony jest adres http lub https\.$/,(_,label)=>`${apiMessage(label,lang)}: an HTTP or HTTPS URL is required.`],
  [/^Dostawca pogody zwrócił HTTP (\d+)\.$/,(_,code)=>`The weather provider returned HTTP ${code}.`]
 ];
 for(const [pattern,render] of patterns){const match=value.match(pattern);if(match)return render(...match);}
 return value;
}
export async function localizeApiResponse(response,request){
 if(response.status<400||!response.headers.get('content-type')?.includes('application/json'))return response;
 const lang=/^en\b/i.test(request.headers.get('accept-language')||'')?'en':'pl';
 const data=await response.clone().json();
 if(typeof data.error!=='string')return response;
 const headers=new Headers(response.headers);headers.set('content-language',lang);
 return new Response(JSON.stringify({...data,error:apiMessage(data.error,lang)}),{status:response.status,headers});
}
