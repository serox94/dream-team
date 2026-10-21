((root)=>{
const pairs=[['Namiot','Tent'],['Podbierak','Landing net'],['Zapasowe baterie','Spare batteries'],['Podpórki pod wędki','Rod rests'],['Śpiwór','Sleeping bag'],['Mata karpiowa','Carp unhooking mat'],['Worek do ważenia','Weigh sling'],['Sprzęt','Equipment'],['Jedzenie / picie','Food / drink'],['Ubrania','Clothing'],['Dokumenty','Documents'],['Elektronika','Electronics'],['Zanęta','Feed'],['Przynęty','Baits'],['Kulki proteinowe','Boilies'],['Łódka zanętowa','Bait boat'],['Zestaw końcowy','Terminal tackle'],['Przypon karpiowy','Carp rig'],['Żyłka główna','Main line'],['Haczyk bezzadziorowy','Barbless hook'],['Sygnalizator brań','Bite alarm']];
const norm=x=>x.trim().toLocaleLowerCase('pl');
function glossary(text,source,target){if(source===target)return text;const index=source==='en'?1:0,row=pairs.find(p=>norm(p[index])===norm(text));return row?.[1-index]??null;}
const english=new Set('the a an and or with without before after near from for to of on in at is are was were be has have this that it do not bring check use using keep spare water drinking electricity fish fishing carp bait boat net bag hook line alarm rig tackle tent batteries rod rests reeds dark peg bank lake swim equipment food clothing documents notes morning evening night'.split(' '));
const polish=new Set('i lub albo z ze bez przed po przy od dla do na w we jest sa byl byly ma maja ten ta to nie zabierz sprawdz uzyj uzywaj zachowaj woda prad ryby wedkowanie karp zaneta lodka podbierak spiwor haczyk zylka alarm przypon zestaw namiot baterie podporki trzciny zmroku stanowisko brzeg jezioro sprzet jedzenie ubrania dokumenty notatki rano wieczor noc'.split(' '));
function classify(text,hint='pl'){
 const value=norm(text);if(pairs.some(p=>norm(p[0])===value))return {language:'pl',confident:true};if(pairs.some(p=>norm(p[1])===value))return {language:'en',confident:true};
 const clean=value.replace(/https?:\/\/\S+/g,'').replace(/[`*_#|]/g,' '),words=clean.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').match(/[a-z]+/g)||[];
 let pl=0,en=0;for(const w of words){if(polish.has(w))pl++;if(english.has(w))en++;}
 if(/[ąćęłńóśźż]/i.test(clean))pl+=2;
 if(en>pl&&en>=1)return {language:'en',confident:true};if(pl>en&&pl>=1)return {language:'pl',confident:true};
 return {language:['pl','en'].includes(hint)?hint:'pl',confident:false};
}
function detect(text,hint='pl'){return classify(text,hint).language;}

root.DreamGlossary={glossary,detect,classify,display:(text,target)=>{const source=detect(text,"pl");return glossary(text,source,target)||text;}};
})(globalThis);
