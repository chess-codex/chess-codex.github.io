// Baixa os feeds e grava src/data/snapshot.json.
// O snapshot vem embutido no app: primeira abertura instantânea e offline,
// e é o que a prévia web usa (navegador bloqueia RSS por CORS; o celular não).
// Uso: node scripts/snapshot.mjs
import { writeFileSync } from 'node:fs';

import { SOURCES } from '../src/data/sources.ts';
import { fetchOgImage, parseFeed } from '../src/lib/rss.ts';

const out = [];
for (const src of SOURCES) {
  try {
    const res = await fetch(src.feed, { headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text(), src.id).slice(0, 10);
    out.push(...items);
    console.log(`${src.id}: ${items.length}`);
  } catch (e) {
    console.warn(`${src.id}: falhou (${e.message})`);
  }
}
out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
// completa fotos que o RSS não trouxe (Chess.com, ChessBase) com a og:image da página
const missing = out.filter((i) => !i.image && !i.source.startsWith('gnews') && !i.source.startsWith('yt-') && i.source !== 'reddit');
for (let k = 0; k < missing.length; k += 6) {
  await Promise.all(missing.slice(k, k + 6).map(async (i) => { i.image = await fetchOgImage(i.url); }));
}
console.log(`fotos: ${out.filter((i) => i.image).length}/${out.length}`);
writeFileSync(new URL('../src/data/snapshot.json', import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), items: out }, null, 1));
console.log(`total: ${out.length}`);
