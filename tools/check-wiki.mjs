// Checks every Wikipedia link in data/parts.json: page exists and is not a disambiguation page.
import fs from 'node:fs';
const { parts } = JSON.parse(fs.readFileSync(new URL('../data/parts.json', import.meta.url), 'utf8'));
let bad = 0;
for (const lang of ['fr', 'en']) {
  const titles = [...new Set(parts.map(p => p[lang]?.wiki).filter(Boolean))];
  for (let i = 0; i < titles.length; i += 40) {
    const q = new URLSearchParams({ action: 'query', format: 'json', redirects: '1', prop: 'pageprops', ppprop: 'disambiguation', titles: titles.slice(i, i + 40).join('|') });
    const r = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?${q}`, { headers: { 'User-Agent': 'anatomy-link-check' } })).json();
    for (const p of Object.values(r.query.pages)) {
      if ('missing' in p || p.pageprops?.disambiguation !== undefined) { bad++; console.log(`${lang}: ${p.title} -> ${'missing' in p ? 'MISSING' : 'DISAMBIGUATION'}`); }
    }
  }
}
for (const p of parts) for (const l of ['fr', 'en']) if (!p[l]?.name || !p[l]?.text) { bad++; console.log(`${p.id}: missing ${l} text`); }
console.log(bad ? `${bad} problem(s)` : 'all links and texts OK');
process.exit(bad ? 1 : 0);
