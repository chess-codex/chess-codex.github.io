// Arquivo de edições: guarda um resumo de cada dia (histórias, notícias e partidas) em arquivo.json,
// e as partidas completas em partidas.json (chave -> partida), os dois publicados junto com o site.
// O GitHub Actions restaura os publicados antes de rodar, então os dias se acumulam sem banco de dados.
// partidas.json é o que deixa o Arquivo e os links compartilhados abrirem a partida dentro do app
// depois que ela sai do digest. Roda depois do digest.mjs.
// Uso: node scripts/archive.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { SOURCES } from '../src/data/sources.ts';

const DAYS = 90; // quanto tempo uma edição (e uma partida) fica no arquivo
const DIGEST = new URL('../src/data/digest.json', import.meta.url);
const OUT = new URL('../src/data/arquivo.json', import.meta.url);
const PAGES = new URL('../docs/arquivo.json', import.meta.url);
const GAMES_OUT = new URL('../src/data/partidas.json', import.meta.url);
const GAMES_PAGES = new URL('../docs/partidas.json', import.meta.url);
// cópias no cache do Actions (.cache, o mesmo do Stockfish): se a restauração do site falhar,
// o histórico volta daqui em vez de recomeçar vazio e sumir do site no próximo deploy
const CACHE_DIR = new URL('../.cache/', import.meta.url);
const OUT_CACHE = new URL('arquivo.json', CACHE_DIR);
const GAMES_CACHE = new URL('partidas.json', CACHE_DIR);

const readJson = (url) => {
  try {
    return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null;
  } catch {
    return null; // corrompido: vale a outra cópia, ou recomeça
  }
};

const digest = JSON.parse(readFileSync(DIGEST, 'utf8'));
// junta o restaurado do site com a cópia do cache: em cada dia vale a versão gravada por último
const byDate = new Map();
for (const src of [readJson(OUT_CACHE), readJson(OUT)]) {
  for (const d of Array.isArray(src?.days) ? src.days : []) {
    const had = byDate.get(d?.date);
    if (d?.date && (!had || (d.updatedAt ?? '') >= (had.updatedAt ?? ''))) byDate.set(d.date, d);
  }
}
const archive = { days: [...byDate.values()] };

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

// só as partidas de destaque (as ligadas a uma notícia não são "Partidas do dia"); a key abre a
// partida no app pelo partidas.json
const fresh = (digest.games ?? []).filter((g) => !g.linked).slice(0, 8).map((g) => ({
  key: g.key,
  white: g.white,
  black: g.black,
  result: g.result,
  round: g.round,
  event: g.event,
  url: g.url,
}));
// partida que já está num dia anterior do arquivo não volta como de hoje (modo "recentes" repete as de 72 h)
const inOtherDays = new Set((archive.days ?? []).filter((d) => d.date !== today).flatMap((d) => (d.games ?? []).map((g) => g.key)).filter(Boolean));
const novel = fresh.filter((g) => !inOtherDays.has(g.key));
// busca incompleta ou que falhou (stale): junta às partidas que o dia já tinha só as que começaram
// hoje (horário do Brasil), em vez de trocar tudo pelas republicadas
const prevToday = (archive.days ?? []).find((d) => d.date === today);
const startedToday = (k) => {
  const s = (digest.games ?? []).find((g) => g.key === k)?.startsAt;
  return !!s && new Date(s - 3 * 3600 * 1000).toISOString().slice(0, 10) === today;
};
const kept = prevToday?.games ?? [];
const games = digest.gamesInfo?.stale
  ? [...kept, ...novel.filter((g) => startedToday(g.key) && !kept.some((k) => k.key === g.key))].slice(0, 8)
  : novel;

const entry = { date: today, updatedAt: digest.generatedAt ?? new Date().toISOString(), stories, news, games };
// a execução mais nova do dia substitui a anterior; o resto do arquivo fica como está
const days = [entry, ...(archive.days ?? []).filter((d) => d.date !== today)]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, DAYS);

// Partidas completas: todas as do digest (destaque e ligadas a notícia), sem os relógios lance a lance.
// `seen` = último dia em que a partida esteve numa edição; some do arquivo 90 dias depois disso.
// Chave repetida (mesmos sobrenomes e rodada em outro torneio) fica com a partida mais nova.
const cutoff = new Date(Date.now() - 3 * 3600 * 1000 - DAYS * 86400 * 1000).toISOString().slice(0, 10);
const partidas = {};
// entre a cópia do cache e a do site vale a análise mais nova (o robô reanalisa o arquivo com
// refreshArchived); com a mesma versão, a vista por último
const newer = (a, b) => (Number(a.analysis) || 0) - (Number(b.analysis) || 0) || String(a.seen ?? '').localeCompare(String(b.seen ?? ''));
for (const src of [readJson(GAMES_CACHE), readJson(GAMES_OUT)]) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
  for (const [key, g] of Object.entries(src)) {
    if (!g || typeof g !== 'object' || (!Array.isArray(g.moves) && !g.none)) continue;
    if (!partidas[key] || newer(g, partidas[key]) >= 0) partidas[key] = g;
  }
}
// partida que a análise certa mostrou sem momento decisivo sai do arquivo (o "erro" antigo era falso)
for (const [key, g] of Object.entries(partidas)) if (g.none) delete partidas[key];
let added = 0;
for (const g of digest.games ?? []) {
  if (!g?.key || !Array.isArray(g.moves) || !Array.isArray(g.evals)) continue;
  const game = { ...g, seen: today };
  delete game.clocks;
  if (!partidas[g.key]) added++;
  partidas[g.key] = game;
}
for (const [key, g] of Object.entries(partidas)) if (!((g.seen ?? '') >= cutoff)) delete partidas[key];

const out = JSON.stringify({ updatedAt: new Date().toISOString(), days });
const gamesOut = JSON.stringify(partidas);
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });
for (const url of [OUT, PAGES, OUT_CACHE]) writeFileSync(url, out);
for (const url of [GAMES_OUT, GAMES_PAGES, GAMES_CACHE]) writeFileSync(url, gamesOut);
console.log(
  `arquivo: ${days.length} dias (hoje ${today}: ${stories.length} histórias, ${news.length} notícias, ${games.length} partidas${digest.gamesInfo?.stale ? ', busca de partidas desatualizada' : ''}); ` +
    `partidas.json: ${Object.keys(partidas).length} partidas (${added} novas, ${Math.round(gamesOut.length / 1024)} KB)`,
);
