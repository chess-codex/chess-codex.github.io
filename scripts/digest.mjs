// Robô de redação: baixa os feeds, traduz e resume cada link em PT com IA
// e agrupa notícias do mesmo assunto em "histórias" com várias fontes.
// Grava src/data/digest.json (e docs/digest.json para publicar no GitHub Pages).
//
// Uso: GROQ_API_KEY=... [NVIDIA_API_KEY=...] node scripts/digest.mjs
// Chaves grátis: https://console.groq.com/keys e https://build.nvidia.com
//
// Anti-invenção: cada tópico de uma história precisa apontar a notícia de onde saiu,
// e uma segunda chamada confere tópico por tópico contra o texto original das fontes.
// O que não tiver base é descartado. Todo item mantém o link original.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { SOURCES } from '../src/data/sources.ts';
import { fetchOgImage, parseFeed } from '../src/lib/rss.ts';
import { fetchTop } from './fide.mjs';

const OUT = new URL('../src/data/digest.json', import.meta.url);
const PAGES = new URL('../docs/digest.json', import.meta.url);
const BATCH = 10; // o plano grátis da Groq limita tokens por minuto; lotes pequenos cabem folgados

// IAs em ordem de preferência. Se uma bater limite ou cair, a próxima assume.
// Os limites da Groq são por modelo, então o modelo menor funciona como reserva.
const PROVIDERS = [
  process.env.GROQ_API_KEY && { name: 'groq/gpt-oss-120b', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
  process.env.NVIDIA_API_KEY && { name: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL ?? 'openai/gpt-oss-120b' },
  process.env.GROQ_API_KEY && { name: 'groq/gpt-oss-20b', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-20b' },
].filter(Boolean);

if (!PROVIDERS.length) {
  console.error('Defina GROQ_API_KEY (grátis em https://console.groq.com/keys) e, opcionalmente, NVIDIA_API_KEY.');
  process.exit(1);
}

// Glossário que evita os erros mais comuns da IA com notícias de xadrez
const GLOSSARY = `Glossário de xadrez (obrigatório):
- "3 0", "3+0", "3|2", "5+3", "10+0" são CONTROLES DE TEMPO (blitz/rápido), nunca placares. "3 0 Thursday" = torneio de blitz 3+0 de quinta-feira.
- "2.5-1.5" em Olimpíada é placar de match (4 tabuleiros); "16/18 pontos de match" não são partidas.
- "swindle" = virada de partida perdida; "Titled Tuesday" é um torneio online semanal; "norm" = norma de título (GM, IM, WGM).
- Brancas (white) e pretas (black) nunca podem ser trocadas.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const used = new Set();

async function callProvider(p, system, user, maxTokens, effort) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.1,
        max_completion_tokens: maxTokens,
        reasoning_effort: effort,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(30, Number(res.headers.get('retry-after') ?? 15)) * 1000;
      console.log(`  ${p.name}: limite de taxa, esperando ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 400 && body.includes('json_') && attempt < 2) {
        console.log(`  ${p.name}: JSON inválido, tentando de novo`);
        continue;
      }
      throw new Error(`${p.name} HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }
  throw new Error(`${p.name}: limite de taxa persistente`);
}

async function ai(system, user, maxTokens, effort = 'low') {
  let last;
  for (const p of PROVIDERS) {
    try {
      const out = await callProvider(p, system, user, maxTokens, effort);
      used.add(p.name);
      return out;
    } catch (e) {
      last = e;
      console.warn(`  ${e.message} → tentando a próxima IA`);
    }
  }
  throw last;
}

const CATEGORIES = ['torneios', 'jogadores', 'ciencia', 'cultura', 'plataformas', 'polemica', 'video', 'outro'];
const normCategory = (c) => {
  const v = String(c ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return CATEGORIES.includes(v) ? v : 'outro';
};

// 1) Feeds
const items = [];
for (const src of SOURCES) {
  try {
    const res = await fetch(src.feed, { headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    items.push(...parseFeed(await res.text(), src.id).slice(0, 10));
  } catch (e) {
    console.warn(`${src.id}: falhou (${e.message})`);
  }
}
const seen = new Set();
const fresh = items
  .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
  .filter((i) => !/[Ѐ-ӿ؀-ۿऀ-ॿ一-鿿]/.test(i.title))
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

for (let k = 0; k < fresh.length; k += 6) {
  await Promise.all(fresh.slice(k, k + 6).filter((i) => !i.image && !i.source.startsWith('gnews') && !i.source.startsWith('yt-') && i.source !== 'reddit').map(async (i) => { i.image = await fetchOgImage(i.url); }));
}
const byId = new Map(fresh.map((i) => [i.id, i]));

// 2) Tradução e resumo por item (só o que ainda não foi processado ou saiu sem traduzir)
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: {} };
const pt = { ...prev.items };
for (const t of Object.values(pt)) t.category = normCategory(t.category);
// vídeos mantêm o título original do YouTube de propósito
const untranslated = (i) => pt[i.id] && i.source !== 'gnews-br' && !i.source.startsWith('yt-') && pt[i.id].title.trim() === i.title.trim();
const todo = fresh.filter((i) => !pt[i.id] || untranslated(i) || /\b\d\s?[+|]?\s?\d\s+(Thursday|Tuesday|Arena)/i.test(i.title));
console.log(`${fresh.length} itens, ${todo.length} para a IA (${PROVIDERS.map((p) => p.name).join(' → ')})`);

const ITEM_PROMPT = `Você é editor de uma gazeta de xadrez em português do Brasil.
Para cada notícia recebida, devolva JSON {"items":[{"id","title","summary","safeTitle","spoiler","category","relevant"}]}:
- title: manchete SEMPRE em português do Brasil, mesmo que o original esteja em inglês. Curta (até 90 caracteres), fiel ao original, sem o nome do veículo no fim. Nomes de jogadores e torneios sem tradução.
- summary: 1 ou 2 frases em PT-BR com o essencial, usando SOMENTE o que está no título e no resumo fornecidos. Nunca invente placar, lance, data, motivo ou declaração.
- spoiler: true se a manchete revela resultado (quem venceu, placar, classificação).
- safeTitle: se spoiler, uma manchete equivalente em PT que não revela o resultado; senão, igual a title.
- category: exatamente uma destas palavras: torneios, jogadores, ciencia, cultura, plataformas, polemica, video, outro. Vídeos do YouTube = video.
- relevant: false só se NÃO for sobre xadrez (ex.: "xadrez" como metáfora política) ou for evento local sem interesse geral. Vídeos de canais de xadrez são relevantes.
Notação de xadrez em português (R, D, T, B, C).
${GLOSSARY}`;

for (let k = 0; k < todo.length; k += BATCH) {
  const batch = todo.slice(k, k + BATCH);
  const payload = batch.map((i) => ({ id: i.id, fonte: i.publisher ?? i.source, titulo: i.title, resumo: i.excerpt.slice(0, 300) }));
  const out = await ai(ITEM_PROMPT, JSON.stringify(payload), 3000);
  for (const r of out.items ?? []) {
    if (!batch.some((i) => i.id === r.id) || !r.title) continue;
    pt[r.id] = {
      title: r.title,
      summary: r.summary ?? '',
      safeTitle: r.safeTitle ?? r.title,
      spoiler: !!r.spoiler,
      category: byId.get(r.id)?.source.startsWith('yt-') ? 'video' : normCategory(r.category),
      relevant: r.relevant !== false,
    };
  }
  console.log(`itens ${k + batch.length}/${todo.length}`);
  // checkpoint: se cair depois, a próxima execução não refaz o que já foi traduzido
  writeFileSync(OUT, JSON.stringify({ ...prev, items: pt }));
  if (k + BATCH < todo.length) await sleep(20000);
}

// 3) Histórias: a IA só agrupa e escreve a manchete. O corpo são os resumos de cada fonte,
// com o nome dela, então nenhum fato novo é criado aqui. A manchete ainda passa por checagem.
const pool = fresh.filter((i) => pt[i.id]?.relevant && !i.source.startsWith('yt-'));
const recent = [
  ...pool.filter((i) => pt[i.id].category === 'torneios').slice(0, 18),
  ...pool.filter((i) => pt[i.id].category !== 'torneios').slice(0, 16),
];

const CLUSTER_PROMPT = `Você é editor-chefe de uma gazeta de xadrez em PT-BR.
Recebe notícias (id, f = fonte, c = categoria, m = manchete, r = resumo). Agrupe as que falam do MESMO fato e escolha as 7 pautas mais relevantes, da mais importante para a menos.
- Priorize fatos cobertos por mais fontes e por redações (chesscom, fide, chessbase, lichess). Evite recapitulações de rodadas antigas se houver notícia mais nova do mesmo evento.
- No máximo 3 pautas sobre o mesmo evento. Se houver jogadores, ciência, cultura, plataformas ou polêmica, pelo menos 3 pautas desses assuntos (pauta de fonte única vale).
Para cada pauta devolva: itemIds; kicker (rótulo curto, ex.: "Olimpíada · Rodada 9"); tag (Torneios, Jogadores, Plataformas ou Bastidores); title (manchete em PT, até 70 caracteres, usando só o que está nas manchetes e resumos, sem acrescentar nacionalidade, idade, número ou adjetivo que não esteja lá); spoiler (true se o title revela resultado); safeTitle (manchete sem o resultado).
Devolva JSON {"stories":[...]}.
${GLOSSARY}`;

await sleep(30000);
let clusters = [];
try {
  ({ stories: clusters = [] } = await ai(
    CLUSTER_PROMPT,
    JSON.stringify(recent.map((i) => ({ id: i.id, f: i.publisher ?? i.source, c: pt[i.id].category, m: pt[i.id].title, r: pt[i.id].summary.slice(0, 120) }))),
    5000,
  ));
} catch (e) {
  console.warn(`agrupamento falhou (${e.message}); mantendo as histórias anteriores`);
}

const VERIFY_PROMPT = `Você é checador de fatos. Para cada pauta:
- kicker / title: true só se estiverem claramente sustentados pelos textos das fontes (tradução e paráfrase valem). Qualquer detalhe a mais (número, motivo, recorde, cor das peças, "primeira vez", unidade trocada) = false.
- mesmoFato: um booleano por fonte, na ordem recebida: true se aquela fonte fala do mesmo fato do title.
Devolva JSON {"checks":[{"i","kicker":bool,"title":bool,"mesmoFato":[bool...]}]}.
${GLOSSARY}`;

const TAGS = ['Torneios', 'Jogadores', 'Plataformas', 'Bastidores'];
const drafts = clusters
  .map((c) => ({ ...c, itemIds: (c.itemIds ?? []).filter((id) => byId.has(id)) }))
  .filter((c) => c.itemIds.length && c.title);

const verified = [];
const verifyPayload = (chunk) =>
  JSON.stringify(chunk.map((c, n) => ({ i: n, kicker: c.kicker, title: c.title, fontes: c.itemIds.slice(0, 5).map((id) => `${byId.get(id).title}. ${byId.get(id).excerpt}`.slice(0, 300)) })));

async function verifyChunk(chunk) {
  try {
    const { checks = [] } = await ai(VERIFY_PROMPT, verifyPayload(chunk), 2500, 'medium');
    return checks;
  } catch (e) {
    if (chunk.length === 1) throw e;
    // lote grande demais para a resposta: confere uma pauta por vez
    console.log('  lote de checagem falhou, conferindo uma por uma');
    const all = [];
    for (let n = 0; n < chunk.length; n++) {
      await sleep(10000);
      try {
        const [ck] = await verifyChunk([chunk[n]]);
        if (ck) all.push({ ...ck, i: n });
      } catch (err) {
        console.warn(`  checagem falhou: ${chunk[n].title} (${err.message.slice(0, 60)})`);
      }
    }
    return all;
  }
}

for (let k = 0; k < drafts.length; k += 3) {
  const chunk = drafts.slice(k, k + 3);
  await sleep(20000);
  const checks = await verifyChunk(chunk);
  chunk.forEach((c, n) => {
    const ck = checks.find((x) => Number(x.i) === n);
    const overlap = verified.find((v) => c.itemIds.filter((id) => v.itemIds.includes(id)).length * 2 >= c.itemIds.length);
    if (overlap) return console.log(`  repetida (mesmas fontes de "${overlap.title}"): ${c.title}`);
    if (ck?.title !== true) return console.log(`  descartada: ${c.title}`);
    // um resumo por fonte (a primeira notícia de cada fonte), com o nome dela
    const ids = c.itemIds.slice(0, 5).filter((_, n) => ck.mesmoFato?.[n] !== false);
    if (!ids.length) return console.log(`  descartada (fontes de outro fato): ${c.title}`);
    if (ids.length < Math.min(5, c.itemIds.length)) console.log(`  ${c.title}: fonte de outro assunto removida`);
    const points = [];
    const seenSrc = new Set();
    for (const id of ids) {
      const it = byId.get(id);
      // "FIDE" pelo Google Notícias e o feed da FIDE são a mesma fonte
      const key = (it.publisher ?? SOURCES.find((x) => x.id === it.source).name).toLowerCase().split(/[\s–-]/)[0];
      if (seenSrc.has(key) || !pt[id]?.summary) continue;
      // comunicado republicado por outro site (ex.: ChessBase copiando a FIDE) não conta como outra voz
      const excerptStart = it.excerpt.slice(0, 80);
      if (excerptStart && points.some((p) => byId.get(p.id).excerpt.startsWith(excerptStart))) continue;
      seenSrc.add(key);
      points.push({ id, source: it.source, publisher: it.publisher ?? null, text: pt[id].summary });
    }
    verified.push({
      itemIds: ids,
      kicker: ck.kicker === true ? c.kicker : (TAGS.includes(c.tag) ? c.tag : 'Bastidores'),
      title: c.title,
      safeTitle: c.safeTitle ?? c.title,
      dek: '', // o app usa o resumo da própria fonte como linha de apoio
      points: points.slice(0, 4),
      tag: TAGS.includes(c.tag) ? c.tag : 'Bastidores',
      spoiler: !!c.spoiler,
    });
    console.log(`  ok: ${c.title}`);
  });
}

// 4) Ranking oficial (Top 10 FIDE + top 5 feminino); se o site da FIDE falhar, mantém o anterior
let players = prev.players ?? [];
try {
  players = [...(await fetchTop('open', 10)), ...(await fetchTop('women', 5))];
} catch (e) {
  console.warn(`ranking FIDE: ${e.message}`);
}

// 5) Grava (mantém só traduções de itens que ainda estão nos feeds)
const keep = Object.fromEntries(fresh.filter((i) => pt[i.id]).map((i) => [i.id, pt[i.id]]));
// se nada passou (IA fora do ar), mantém a edição anterior em vez de publicar vazio
const stories = verified.length ? verified : (prev.stories ?? []).filter((s) => s.points);
const digest = { generatedAt: new Date().toISOString(), model: [...used].join(', '), feed: fresh, items: keep, stories, players };
writeFileSync(OUT, JSON.stringify(digest));
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(PAGES, JSON.stringify(digest));
console.log(`pronto: ${Object.keys(keep).length} manchetes em PT, ${stories.length} histórias checadas (IAs: ${[...used].join(', ')})`);
