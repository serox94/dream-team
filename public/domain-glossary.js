((root)=>{
const pairs=[['Namiot','Tent'],['Podbierak','Landing net'],['Zapasowe baterie','Spare batteries'],['Podpórki pod wędki','Rod rests'],['Śpiwór','Sleeping bag'],['Mata karpiowa','Carp unhooking mat'],['Worek do ważenia','Weigh sling'],['Sprzęt','Equipment'],['Jedzenie / picie','Food / drink'],['Ubrania','Clothing'],['Dokumenty','Documents'],['Elektronika','Electronics'],['Zanęta','Feed'],['Przynęty','Baits']];
const norm=x=>x.trim().toLocaleLowerCase('pl');
function glossary(text,source,target){if(source===target)return text;const index=source==='en'?1:0,row=pairs.find(p=>norm(p[index])===norm(text));return row?.[1-index]??null;}
function detect(text,hint='pl'){if(pairs.some(p=>norm(p[0])===norm(text)))return 'pl';if(pairs.some(p=>norm(p[1])===norm(text)))return 'en';if(/[ąćęłńóśźż]/i.test(text))return 'pl';return ['pl','en'].includes(hint)?hint:'pl';}

root.DreamGlossary={glossary,detect,display:(text,target)=>{const source=detect(text,"pl");return glossary(text,source,target)||text;}};
})(globalThis);
