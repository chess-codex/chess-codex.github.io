// Baixa os feeds e grava src/data/snapshot.json.
// O snapshot vem embutido no app: primeira abertura instantânea e offline,
// e é o que a prévia web usa (navegador bloqueia RSS por CORS; o celular não).
// Uso: node scripts/snapshot.mjs
import { writeFileSync } from 'node:fs';

import { SOURCES, wantsOgImage } from '../src/data/sources.ts';
import { fetchOgImage, parseSource } from '../src/lib/rss.ts';

const out = [];
const failed = [];
// todas as fontes ao mesmo tempo, como o celular faz; servidor travado desiste em 30 s
const results = await Promise.all(SOURCES.map(async (src) => {
  const t0 = Date.now();
  try {
    const res = await fetch(src.feed, { headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseSource(await res.text(), src);
    // página de bloqueio (Cloudflare) volta com 200 e sem nenhum item: conta como falha
    if (!items.length) throw new Error('feed vazio');
    return { src, items: items.slice(0, 10), total: items.length, ms: Date.now() - t0 };
  } catch (e) {
    return { src, error: e.message, ms: Date.now() - t0 };
  }
}));
for (const r of results) {
  if (r.error) {
    failed.push(r.src.id);
    console.warn(`${r.src.id}: falhou (${r.error}, ${r.ms} ms)`);
    continue;
  }
  out.push(...r.items);
  console.log(`${r.src.id}: ${r.items.length} de ${r.total} (${r.ms} ms, ${r.items.filter((i) => i.image).length} com foto no feed)`);
}
out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
// completa fotos que o feed não trouxe (Chess.com, ChessBase, El País) com a og:image da página
const missing = out.filter((i) => !i.image && wantsOgImage(i.source));
for (let k = 0; k < missing.length; k += 6) {
  await Promise.all(missing.slice(k, k + 6).map(async (i) => { i.image = await fetchOgImage(i.url); }));
}
console.log(`og:image: ${missing.filter((i) => i.image).length} de ${missing.length} achadas`);
// cobertura de foto por fonte, depois da og:image
const bySource = new Map();
for (const i of out) {
  const s = bySource.get(i.source) ?? { n: 0, img: 0 };
  s.n++;
  if (i.image) s.img++;
  bySource.set(i.source, s);
}
console.log(`fotos por fonte: ${[...bySource].map(([id, s]) => `${id} ${s.img}/${s.n}`).join(' · ')}`);
console.log(`fotos: ${out.filter((i) => i.image).length}/${out.length}`);
writeFileSync(new URL('../src/data/snapshot.json', import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), items: out }, null, 1));
console.log(`total: ${out.length}${failed.length ? ` · falharam: ${failed.join(', ')}` : ' · nenhuma fonte falhou'}`);
