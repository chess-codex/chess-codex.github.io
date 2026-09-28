// Partidas do dia: baixa as rodadas recentes das transmissões de elite do Lichess (API pública)
// e acha a posição decisiva de cada jogo pela avaliação do motor lance a lance.
// Tudo aqui é cálculo sobre o PGN: nenhuma frase é escrita por IA.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { Chess } from 'chess.js';

import { createEngine } from './engine.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' };
const HOURS = 72; // partidas das últimas 72h servem para ligar às notícias
const MIN_FEATURED = 8; // abaixo disso a seção completa com partidas dos últimos 3 dias
const FEATURED_HOURS = 36; // "Partidas do dia" mostra só as últimas 36h
const MATE = 20;

async function json(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function text(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const EASTERN = /China|Chinese|Korea|Vietnam|Taipei/i;
const person = (raw, team = '') => {
  // "Abdusattorov, Nodirbek" → "Nodirbek Abdusattorov"; China/Coreia/Vietnã: "Ding Liren"
  // sem vírgula: "Erigaisi Arjun" → "Arjun Erigaisi"; "Gukesh D" e "Praggnanandhaa R" ficam iguais
  const [last, first] = raw.split(',').map((s) => s.trim());
  if (!first) {
    const parts = last.split(/\s+/);
    return parts.length === 2 && parts[1].length > 1 && !EASTERN.test(team) ? `${parts[1]} ${parts[0]}` : last;
  }
  return EASTERN.test(team) ? `${last} ${first}` : `${first} ${last}`;
};
const surname = (raw) => {
  const [last, first] = raw.split(',').map((s) => s.trim());
  // sem vírgula, o sobrenome vem primeiro ("Erigaisi Arjun", "Gukesh D")
  return first ? last : last.split(/\s+/)[0];
};

function clockSeconds(c) {
  const [h, m, s] = c.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** Lê um jogo do PGN e calcula o momento decisivo. */
export function analyzeGame(raw, meta = {}) {
  const tag = (k) => raw.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? '';
  const result = tag('Result');
  if (!['1-0', '0-1', '1/2-1/2'].includes(result)) return null; // em andamento: fica para a próxima rodada do robô

  const comments = [...raw.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const evals = [];
  const clocks = [];
  for (const c of comments) {
    const e = c.match(/\[%eval ([^\]\s]+)/)?.[1];
    evals.push(e == null ? null : e.startsWith('#') ? (e.includes('-') ? -MATE : MATE) : Math.max(-MATE, Math.min(MATE, Number(e))));
    const k = c.match(/\[%clk ([\d:]+)/)?.[1];
    clocks.push(k ? clockSeconds(k) : null);
  }

  const g = new Chess();
  try {
    g.loadPgn(raw.replace(/\{[^}]*\}/g, ''));
  } catch {
    return null;
  }
  const moves = g.history();
  if (moves.length < 20 || evals.filter((e) => e != null).length < moves.length * 0.8) return null; // sem análise do motor

  // avaliação depois de cada lance (ponto de vista das brancas); buraco herda a anterior
  const ev = [];
  for (let i = 0; i < moves.length; i++) ev.push(evals[i] ?? ev[i - 1] ?? 0.2);
  const k = keyMoment(ev, result);
  if (!k) return null;
  const { keyPly } = k;

  const moverClockBefore = keyPly >= 2 ? clocks[keyPly - 2] : null;
  const white = tag('White');
  const black = tag('Black');
  const whiteElo = Number(tag('WhiteElo')) || 0;
  const blackElo = Number(tag('BlackElo')) || 0;
  const key = `${surname(white)}-${surname(black)}-${tag('Round') || meta.round || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9-]/g, '');

  return {
    key,
    event: meta.event ?? tag('Event'),
    round: meta.round ?? tag('Round'),
    date: tag('UTCDate') || tag('Date'),
    white: person(white, tag('WhiteTeam')),
    black: person(black, tag('BlackTeam')),
    whiteSurname: surname(white),
    blackSurname: surname(black),
    whiteElo,
    blackElo,
    whiteTeam: tag('WhiteTeam') || undefined,
    blackTeam: tag('BlackTeam') || undefined,
    result,
    opening: tag('Opening') || undefined,
    eco: tag('ECO') || undefined,
    url: tag('GameURL') || meta.url || '',
    moves,
    evals: ev.map((e) => Math.round(e * 10) / 10),
    ...k,
    keyClock: moverClockBefore, // segundos que o jogador tinha antes do lance decisivo
    clocks, // só para recalcular o relógio depois da análise do Stockfish; sai antes de publicar
    engine: 'transmissão',
  };
}

/**
 * Momento decisivo a partir da avaliação lance a lance (brancas = positivo).
 * Vitória: lance do perdedor que mais piorou a própria avaliação enquanto ainda não estava perdido.
 * Empate: a maior vantagem (1,5+) que escapou.
 */
export function keyMoment(ev, result) {
  const before = (i) => (i === 0 ? 0.2 : ev[i - 1]);
  let keyPly = -1;
  let keyKind = 'erro';
  if (result !== '1/2-1/2') {
    const loserIsWhite = result === '0-1';
    const pov = loserIsWhite ? 1 : -1;
    let best = 0;
    for (let i = 0; i < ev.length; i++) {
      if ((i % 2 === 0) !== loserIsWhite) continue;
      const b = before(i) * pov;
      const a = ev[i] * pov;
      if (b < -2) continue; // já estava perdido
      const drop = Math.min(b, 6) - Math.max(a, -6);
      if (drop > best) {
        best = drop;
        keyPly = i;
      }
    }
  } else {
    keyKind = 'chance';
    let best = 0;
    for (let i = 0; i < ev.length; i++) {
      const drop = Math.abs(Math.max(-6, Math.min(6, before(i))) - Math.max(-6, Math.min(6, ev[i])));
      if (drop > best && drop >= 2 && Math.abs(before(i)) >= 1.5) {
        best = drop;
        keyPly = i;
      }
    }
  }
  if (keyPly < 0) return null;
  // virada: o vencedor chegou a estar claramente perdido
  let comeback = null;
  if (result !== '1/2-1/2') {
    const pov = result === '1-0' ? 1 : -1;
    const worst = Math.min(...ev.map((e) => e * pov));
    if (worst <= -2.5) comeback = Math.round(worst * 10) / 10;
  }
  return {
    keyPly,
    keyKind,
    keyBefore: Math.round(before(keyPly) * 10) / 10,
    keyAfter: Math.round(ev[keyPly] * 10) / 10,
    comeback,
  };
}

const ENGINE_DEPTH = 12; // ~4 s por partida no GitHub; basta para achar o erro decisivo
const ENGINE_GAMES = 24; // quantas partidas (as mais notícia) passam pelo Stockfish por execução
const KEY_DEPTH = 16; // os números mostrados no momento decisivo saem de análise mais funda
// Cache de TODAS as partidas analisadas (não só as publicadas), guardado pelo actions/cache entre
// execuções: partida terminada não muda, e reanalisar as 24 custava ~3 min por execução.
// Fica fora do site: o app não baixa isso. Guarda também "sem momento decisivo", para não repetir.
const ENGINE_CACHE = new URL('../.cache/engine.json', import.meta.url);
const ENGINE_CACHE_MAX = 400;

/**
 * Reavalia as partidas com o nosso Stockfish e recalcula o momento decisivo.
 * Partida que já foi analisada numa execução anterior (mesmos lances) reaproveita o resultado.
 * Partida que o Stockfish não consegue analisar sai da lista: sem análise confiável, não publicamos.
 */
export async function analyzeWithEngine(games) {
  let cache = new Map();
  try {
    const saved = JSON.parse(readFileSync(ENGINE_CACHE, 'utf8'));
    cache = new Map((Array.isArray(saved) ? saved : []).filter((g) => g?.key).map((g) => [g.key, g]));
  } catch {
    // primeira execução com cache (ou cache perdido): usa o que o digest anterior publicou
  }
  try {
    const prev = JSON.parse(readFileSync(new URL('../src/data/digest.json', import.meta.url), 'utf8'));
    for (const g of prev.games ?? []) if (g.engine === 'Stockfish 19' && !cache.has(g.key)) cache.set(g.key, g);
  } catch {
    // sem digest anterior: analisa tudo
  }
  let hits = 0;
  // usada agora vai para o fim da fila: o corte do cache tira as que ninguém usa há mais tempo
  const touch = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
  };
  const engine = await createEngine({ depth: ENGINE_DEPTH });
  const deep = await createEngine({ depth: KEY_DEPTH });
  const out = [];
  try {
    for (const g of games) {
      const old = cache.get(g.key);
      if (old && (old.moves?.length ?? old.plies) === g.moves.length) {
        hits++;
        touch(g.key, old);
        if (!old.none) out.push({ ...g, ...old });
        continue;
      }
      // "sem momento decisivo" também vai para o cache (a partida é igual na próxima execução)
      const none = () => touch(g.key, { key: g.key, plies: g.moves.length, none: true });
      try {
        const ch = new Chess();
        const fens = [ch.fen()];
        for (const m of g.moves) {
          ch.move(m);
          fens.push(ch.fen());
        }
        const ev = [];
        for (let i = 1; i < fens.length; i++) ev.push((await engine.evaluate(fens[i])) ?? ev[i - 2] ?? 0.2);
        let k = keyMoment(ev, g.result);
        if (!k) {
          none();
          continue;
        }
        // confirma os números do momento decisivo (e dos vizinhos) com análise funda
        for (let i = Math.max(0, k.keyPly - 2); i <= Math.min(ev.length - 1, k.keyPly + 1); i++) {
          ev[i] = (await deep.evaluate(fens[i + 1])) ?? ev[i];
        }
        k = keyMoment(ev, g.result);
        if (!k) {
          none();
          continue;
        }
        out.push({
          ...g,
          evals: ev.map((e) => Math.round(e * 10) / 10),
          ...k,
          keyClock: k.keyPly >= 2 ? g.clocks?.[k.keyPly - 2] ?? null : null,
          engine: 'Stockfish 19',
        });
      } catch (e) {
        console.warn(`  Stockfish falhou em ${g.key}: ${e.message}`);
      }
    }
  } finally {
    engine.quit();
    deep.quit();
  }
  const result = out.map(({ clocks, ...g }) => g);
  console.log(`Stockfish: ${games.length - hits} analisadas agora, ${hits} do cache`);
  try {
    for (const g of result) touch(g.key, g);
    mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
    // as mais novas ficam (a Map guarda a ordem de inserção)
    writeFileSync(ENGINE_CACHE, JSON.stringify([...cache.values()].slice(-ENGINE_CACHE_MAX)));
  } catch (e) {
    console.warn(`cache do Stockfish não gravado: ${e.message}`);
  }
  return result;
}

/** Quão "notícia" é a partida: força dos jogadores + drama + resultado. */
export function gameScore(g, topSurnames = []) {
  const elo = Math.max(g.whiteElo, g.blackElo);
  const swing = Math.abs(Math.max(-6, Math.min(6, g.keyBefore)) - Math.max(-6, Math.min(6, g.keyAfter)));
  const top = [g.whiteSurname, g.blackSurname].some((s) => topSurnames.includes(s.toLowerCase())) ? 120 : 0;
  return (elo - 2400) / 2 + swing * 12 + (g.result === '1/2-1/2' ? 0 : 40) + (g.comeback ? 50 : 0) + top;
}

/** Rodadas das últimas horas nos eventos de elite (tier 4 e 5), incluindo as seções irmãs (ex.: feminino). */
export async function fetchRecentGames({ topSurnames = [], limit = 16 } = {}) {
  const tours = new Map();
  for (const page of [1, 2]) {
    const top = await json(`https://lichess.org/api/broadcast/top?page=${page}`);
    for (const b of [...(top.active ?? []), ...(top.past?.currentPageResults ?? [])]) {
      if ((b.tour?.tier ?? 0) >= 4) tours.set(b.tour.id, b.tour.name);
    }
  }
  const since = Date.now() - HOURS * 3600 * 1000;
  const rounds = [];
  const seenTours = new Set();
  for (const id of tours.keys()) {
    if (seenTours.has(id)) continue;
    const info = await json(`https://lichess.org/api/broadcast/${id}`);
    // seções do mesmo evento: só a primeira faixa de mesas de cada seção (onde estão os fortes)
    const siblings = info.group?.tours?.filter((t) => /(^|\| )(Matches 1-|Boards? 1-)/i.test(t.name) || !/Matches|Boards?/i.test(t.name)) ?? [{ id }];
    for (const sib of siblings) {
      if (seenTours.has(sib.id)) continue;
      seenTours.add(sib.id);
      const tinfo = sib.id === id ? info : await json(`https://lichess.org/api/broadcast/${sib.id}`);
      const event = info.group?.name ?? tinfo.tour.name;
      // "46th ... 2026 | Women | Matches 1-25" → "Women"
      const section = info.group
        ? tinfo.tour.name.split('|').map((x) => x.trim()).filter((x) => x && !/Matches|Boards?/i.test(x) && !x.includes(event)).join(' ')
        : '';
      const sectionPt = section.replace(/^Open$/i, 'Aberto').replace(/^Women$/i, 'Feminino');
      for (const r of tinfo.rounds ?? []) {
        if ((r.startsAt ?? 0) >= since && (r.finished || r.ongoing)) {
          const round = r.name.replace(/^Round\b/i, 'Rodada').replace(/^Game\b/i, 'Partida').replace(/\bFinals?\b/i, 'Final');
          rounds.push({ id: r.id, event: sectionPt ? `${event} · ${sectionPt}` : event, round, startsAt: r.startsAt });
        }
      }
    }
  }

  const games = [];
  for (const r of rounds) {
    try {
      const pgn = await text(`https://lichess.org/api/broadcast/round/${r.id}.pgn`);
      for (const raw of pgn.split(/\n\n(?=\[Event )/)) {
        const g = analyzeGame(raw, { event: r.event, round: r.round });
        if (g) g.startsAt = r.startsAt;
        if (g && Math.max(g.whiteElo, g.blackElo) >= 2450) games.push(g);
      }
    } catch (e) {
      console.warn(`rodada ${r.id}: ${e.message}`);
    }
  }
  const candidates = [...new Map(games.map((g) => [g.key, g])).values()];
  const recentCut = Date.now() - FEATURED_HOURS * 3600 * 1000;
  // pré-seleção pela avaliação da transmissão; as escolhidas (e todas com jogador do Top 10)
  // são reanalisadas pelo nosso Stockfish, e só essas podem ser publicadas ou ligadas a notícias
  candidates.sort((a, b) => gameScore(b, topSurnames) - gameScore(a, topSurnames));
  const withTop = (g) => [g.whiteSurname, g.blackSurname].some((s) => topSurnames.includes(s.toLowerCase()));
  const toAnalyze = candidates.filter((g, i) => i < ENGINE_GAMES || withTop(g));
  const unique = await analyzeWithEngine(toAnalyze);
  console.log(`Stockfish: ${unique.length} de ${toAnalyze.length} partidas com momento decisivo`);
  unique.sort((a, b) => gameScore(b, topSurnames) - gameScore(a, topSurnames));
  // variedade: as 4 melhores de cada seção/evento primeiro (ex.: feminino não some atrás do aberto)
  const picked = [];
  const perEvent = new Map();
  for (const g of unique.filter((x) => x.startsAt >= recentCut)) {
    const n = perEvent.get(g.event) ?? 0;
    if (n < 4) {
      picked.push(g);
      perEvent.set(g.event, n + 1);
    }
  }
  for (const g of unique) if (picked.length < limit && !picked.includes(g) && g.startsAt >= recentCut) picked.push(g);
  // dia sem torneio grande: completa com as melhores dos últimos 3 dias (já analisadas pelo Stockfish)
  for (const g of unique) if (picked.length < MIN_FEATURED && !picked.includes(g)) picked.push(g);
  picked.sort((a, b) => gameScore(b, topSurnames) - gameScore(a, topSurnames));
  console.log(`partidas: ${rounds.length} rodadas, ${games.length} jogos analisados, ${Math.min(limit, picked.length)} escolhidos`);
  return { featured: picked.slice(0, limit), all: unique };
}

// Seleções escritas como nas manchetes (inglês e português)
const TEAM_ALIASES = {
  'United States of America': ['U.S.', 'USA', 'United States', 'EUA', 'Estados Unidos'],
  Uzbekistan: ['Uzbekistan', 'Uzbequistão'],
  India: ['India', 'Índia'],
  Germany: ['Germany', 'Alemanha'],
  China: ['China'],
  Armenia: ['Armenia', 'Armênia'],
  England: ['England', 'Inglaterra'],
  Kazakhstan: ['Kazakhstan', 'Cazaquistão'],
  Netherlands: ['Netherlands', 'Holanda', 'Países Baixos'],
  France: ['France', 'França'],
  Spain: ['Spain', 'Espanha'],
  Brazil: ['Brazil', 'Brasil'],
};

/**
 * Acha a partida de que a notícia fala: os dois jogadores citados > um jogador > as duas seleções > uma seleção.
 * Entre as candidatas do mesmo nível, a mais dramática.
 */
export function linkGame(text, games, topSurnames = []) {
  const has = (w) => w && w.length >= 3 && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text);
  const team = (t) => (t ? (TEAM_ALIASES[t] ?? [t]).some(has) : false);
  // citar um jogador só liga a partida se a notícia fala de jogo (um homenageado num prêmio, por exemplo, não)
  const aboutPlay = /\b(beats?|defeat\w*|won|wins?|draws?|drew|game|round|swindl\w*|clinch\w*|hero|venc\w*|derrot\w*|empat\w*|partida|rodada|virada|vitória|ouro|gold)\b/i.test(text);
  // jogadores conhecidos citados na notícia (das partidas analisadas e do Top 10)
  const known = new Set([...games.flatMap((g) => [g.whiteSurname, g.blackSurname]), ...topSurnames].filter((n) => n && n.length >= 4).map((n) => n.toLowerCase()));
  const mentioned = [...known].filter(has);
  // "9ª rodada", "rodada 9", "round 9", "R9": a partida tem que ser dessa rodada
  // várias rodadas citadas (ex.: "R9" e "Rounds 10–11") = qualquer uma delas vale
  const rounds = new Set();
  for (const m of text.matchAll(/(?:rodadas?|rounds?)\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?|\b(\d{1,2})\s*[ªºa]?\s*rodada|\bR(\d{1,2})\b/gi)) {
    const a = Number(m[1] ?? m[3] ?? m[4]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b && n - a < 12; n++) rounds.add(n);
  }
  const level = (g) => {
    if (rounds.size && !rounds.has(Number(String(g.round).match(/\d+/)?.[0]))) return 0;
    const w = g.whiteSurname.length >= 4 && has(g.whiteSurname);
    const b = g.blackSurname.length >= 4 && has(g.blackSurname);
    if (w && b) return 4;
    if (!aboutPlay) return 0;
    // a notícia cita outro jogador que não está nesta partida: é outro jogo
    const players = [g.whiteSurname.toLowerCase(), g.blackSurname.toLowerCase()];
    if (mentioned.some((n) => !players.includes(n))) return 0;
    if (w || b) return 3;
    const tw = team(g.whiteTeam);
    const tb = team(g.blackTeam);
    if (tw && tb) return 2;
    return 0;
  };
  let best = null;
  let bestLevel = 0;
  for (const g of games) {
    const l = level(g);
    if (l > bestLevel || (l === bestLevel && l > 0 && gameScore(g, topSurnames) > gameScore(best, topSurnames))) {
      best = g;
      bestLevel = l;
    }
  }
  return best;
}
