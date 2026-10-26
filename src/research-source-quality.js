// A rules page with several empty sections is not complete source evidence.
// Basic extraction sometimes drops HTML lists; only affected rules are upgraded.
export function missingRuleLists(content,url){
 if(!/rules|reglement|regulamin|regulations/i.test(new URL(url).pathname))return false;
 const sections=[...String(content).matchAll(/^#{2,6}[^\n]+\n([\s\S]*?)(?=^#{2,6}[^\n]+|$(?![\s\S]))/gm)];
 return sections.filter(s=>!s[1].trim()).length>=3;
}
