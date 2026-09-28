// Arquivo de edições: guarda um resumo de cada dia (histórias, notícias e partidas) em arquivo.json,
// publicado junto com o site. O GitHub Actions restaura o arquivo publicado antes de rodar,
// então os dias se acumulam sem banco de dados. Roda depois do digest.mjs.
// Uso: node scripts/archive.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { SOURCES } from '../src/data/sources.ts';

const DAYS = 90; // quanto tempo uma edição fica no arquivo
const DIGEST = new URL('../src/data/digest.json', import.meta.url);
const OUT = new URL('../src/data/arquivo.json', import.meta.url);
const PAGES = new URL('../docs/arquivo.json', import.meta.url);

const digest = JSON.parse(readFileSync(DIGEST, 'utf8'));
let archive = { days: [] };
try {
  if (existsSync(OUT)) archive = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  // arquivo corrompido: recomeça; o site só perde o histórico, nunca a edição de hoje
}

// o dia da edição é o do Brasil (UTC-3), não o do servidor
const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const byId = new Map((digest.feed ?? []).map((i) => [i.id, i]));
const kindOf = (id) => SOURCES.find((s) => s.id === id)?.kind;
const sourceName = (it) => it?.publisher ?? SOURCES.find((s) => s.id === it?.source)?.name ?? '';
const first = (arr) => (arr ?? []).find((x) => typeof x === 'string' && x.trim()) ?? '';

const stories = (digest.stories ?? []).slice(0, 8).map((st) => {
  const lead = byId.get(st.itemIds?.[0]);
  return {
    title: st.title,
    kicker: st.kicker ?? '',
    text: first(st.body) || st.points?.find((p) => p.checked)?.text || '',
    url: lead?.url ?? '',
    source: sourceName(lead),
    image: st.itemIds?.map((id) => byId.get(id)?.image).find(Boolean) ?? null,
  };
});

const inStory = new Set((digest.stories ?? []).flatMap((s) => s.itemIds ?? []));
const news = (digest.feed ?? [])
  .filter((i) => ['jornal', 'geral'].includes(kindOf(i.source)) && !inStory.has(i.id))
  .map((i) => ({ i, tr: digest.items?.[i.id], art: digest.articles?.[i.id] }))
  .filter(({ tr }) => tr && tr.relevant !== false && tr.summary)
  .slice(0, 20)
  .map(({ i, tr, art }) => ({
    title: tr.title,
    summary: first(art?.paragraphs) || tr.summary,
    url: i.url,
    source: sourceName(i),
    image: i.image ?? null,
  }));

// só as partidas de destaque (as ligadas a uma notícia não são "Partidas do dia")
const games = (digest.games ?? []).filter((g) => !g.linked).slice(0, 8).map((g) => ({
  white: g.white,
  black: g.black,
  result: g.result,
  round: g.round,
  event: g.event,
  url: g.url,
}));

const entry = { date: today, updatedAt: digest.generatedAt ?? new Date().toISOString(), stories, news, games };
// a execução mais nova do dia substitui a anterior; o resto do arquivo fica como está
const days = [entry, ...(archive.days ?? []).filter((d) => d.date !== today)]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, DAYS);

const out = JSON.stringify({ updatedAt: new Date().toISOString(), days });
writeFileSync(OUT, out);
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(PAGES, out);
console.log(`arquivo: ${days.length} dias (hoje ${today}: ${stories.length} histórias, ${news.length} notícias, ${games.length} partidas)`);
