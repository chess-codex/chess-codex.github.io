// Partidas do dia: baixa as rodadas recentes das transmissões de elite do Lichess (API pública)
// e acha a posição decisiva de cada jogo pela avaliação do motor lance a lance.
// Tudo aqui é cálculo sobre o PGN: nenhuma frase é escrita por IA.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { Chess } from 'chess.js';

import { createEngine } from './engine.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' };
const HOURS = 72; // partidas das últimas 72h servem para ligar às notícias (e para "Partidas recentes")
const DAY_HOURS = 30; // "Partidas do dia": rodadas que começaram nas últimas 30 h
const DAY_MIN = 3; // com menos partidas de elite no dia, a seção vira "Partidas recentes" (até 72 h)
const MAX_FEATURED = 8;
const MAX_RECENT = 6;
const MATE = 20;
const H = 3_600_000;

// Fila de pedidos ao Lichess: um por vez, ~1 s entre eles. Em rajada (~33 pedidos em 11 s) ele
// devolve HTTP 429 e a regra dele é esperar um minuto inteiro antes de voltar.
const GAP_MS = 1000;
const WAIT_429_MS = 60_000;
const MAX_429_WAITS = 2; // cada espera custa 1 min da execução (o texto vem depois e tem teto)
const FETCH_MS = 4 * 60_000; // teto da busca inteira; o que não deu tempo fica para a próxima execução
const lichessState = { nextAt: 0, waits: 0, blocked: false, timedOut: false, t0: 0, calls: 0, fromCache: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lichess(url, as = 'json') {
  const s = lichessState;
  const stop = (why) => Object.assign(new Error(`${url}: ${why}`), { quiet: true });
  if (s.blocked) throw stop('Lichess bloqueado nesta execução (HTTP 429)');
  if (s.t0 && Date.now() - s.t0 > FETCH_MS) {
    s.timedOut = true;
    throw stop('tempo da busca esgotado');
  }
  for (let retried = false; ; retried = true) {
    const wait = s.nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    let res;
    try {
      s.calls++;
      res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(as === 'json' ? 20000 : 30000) });
    } finally {
      s.nextAt = Date.now() + GAP_MS;
    }
    if (res.status === 429) {
      await res.body?.cancel().catch(() => {});
      // 429 de novo depois da espera: para de pedir no resto da execução. Sem isso, cada torneio e
      // cada rodada repetiria a espera de 1 min e estouraria o tempo do robô
      if (retried || s.waits >= MAX_429_WAITS) {
        s.blocked = true;
        throw new Error(`${url}: HTTP 429`);
      }
      s.waits++;
      console.warn(`Lichess: HTTP 429, esperando ${WAIT_429_MS / 1000} s para tentar de novo`);
      s.nextAt = Date.now() + WAIT_429_MS;
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return as === 'json' ? res.json() : res.text();
  }
}

// PGN de rodada terminada não muda: fica em .cache/rounds (o actions/cache guarda .cache entre
// execuções) e só as rodadas novas ou em andamento são baixadas. Só entra no cache 2 h depois do
// fim, quando a transmissão já pôs [%eval] em todos os lances (jogo sem avaliação é descartado).
const CACHE_DIR = new URL('../.cache/', import.meta.url);
const ROUNDS_DIR = new URL('rounds/', CACHE_DIR);
const TOURS_DIR = new URL('tours/', CACHE_DIR);
const ROUND_SETTLE_MS = 2 * H;

function pruneCache() {
  // arquivo sem uso há mais de 4 dias já saiu da janela de 72 h
  for (const dir of [ROUNDS_DIR, TOURS_DIR]) {
    try {
      for (const f of readdirSync(dir)) {
        const file = new URL(f, dir);
        if (Date.now() - statSync(file).mtimeMs > 96 * H) rmSync(file, { force: true });
      }
    } catch {
      // pasta ainda não existe
    }
  }
}

function saveCache(dir, name, body) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL(name, dir), body);
  } catch (e) {
    console.warn(`  cache não gravado (${name}): ${e.message}`);
  }
}

async function roundPgn(r) {
  const name = `${String(r.id).replace(/[^\w-]/g, '')}.pgn`;
  if (r.finished) {
    try {
      return { pgn: readFileSync(new URL(name, ROUNDS_DIR), 'utf8'), cached: true };
    } catch {
      // ainda não está no cache
    }
  }
  const pgn = await lichess(`https://lichess.org/api/broadcast/round/${r.id}.pgn`, 'text');
  if (r.finished && r.finishedAt && Date.now() - r.finishedAt >= ROUND_SETTLE_MS) saveCache(ROUNDS_DIR, name, pgn);
  return { pgn, cached: false };
}

// Dados do torneio (seções e rodadas): se o Lichess falhar agora, vale a cópia da última execução,
// e as rodadas terminadas dela ainda saem do cache de PGN
async function tourInfo(id) {
  const name = `${String(id).replace(/[^\w-]/g, '')}.json`;
  try {
    const info = await lichess(`https://lichess.org/api/broadcast/${id}`);
    saveCache(TOURS_DIR, name, JSON.stringify({ tour: info.tour, group: info.group, rounds: info.rounds }));
    return info;
  } catch (e) {
    let saved;
    try {
      saved = JSON.parse(readFileSync(new URL(name, TOURS_DIR), 'utf8'));
    } catch {
      throw e;
    }
    lichessState.fromCache++;
    return saved;
  }
}

// Ritmo pela regra da FIDE (tempo de cada jogador para 60 lances): 60 min ou mais é clássico
// (standard), mais de 10 min é rápida, até 10 min é blitz
const tcOf = (base, inc) => (base + 60 * inc >= 3600 ? 'standard' : base + 60 * inc > 600 ? 'rapid' : 'blitz');

/** Tag TimeControl: "5400+30" (segundos), "90+30" e "3+2" (minutos, como vem nas transmissões), "40/5400+30:1800+30". */
export function tcFromTag(tag) {
  const m = String(tag ?? '').split(':')[0].match(/^\s*(?:\d+\/)?(\d+)(?:\+(\d+))?\s*$/);
  if (!m) return null;
  // base de até 120 é minuto: ninguém transmite partida com 2 min de base escrita em segundos
  const base = Number(m[1]) <= 120 ? Number(m[1]) * 60 : Number(m[1]);
  return tcOf(base, Number(m[2] ?? 0));
}

/** Ritmo da seção: nome ("Blitz | Men", rodada "Armageddon"), texto livre da transmissão ("90 min / 40 moves + 30 min + 30 sec / move") ou fideTC. */
function tcFromInfo(info = {}, name = '') {
  if (/\b(blitz|bullet|armageddon)\b/i.test(name)) return 'blitz';
  if (/\brapid\b/i.test(name)) return 'rapid';
  const txt = String(info?.tc ?? '');
  const base = txt.match(/(\d+)\s*(?:min|'|m\b)/i)?.[1] ?? txt.match(/^\s*(\d+)\s*\+/)?.[1];
  const inc = txt.match(/(\d+)\s*(?:sec|s\b|")/i)?.[1] ?? txt.match(/^\s*\d+\s*\+\s*(\d+)/)?.[1];
  if (base) return tcOf(Number(base) * 60, Number(inc ?? 0));
  if (/classical|standard/i.test(txt)) return 'standard';
  if (/rapid/i.test(txt)) return 'rapid';
  if (/blitz/i.test(txt)) return 'blitz';
  // o fideTC sozinho engana (o blitz do Pan-Americano diz "standard"), por isso vem por último
  return ['standard', 'rapid', 'blitz'].includes(info?.fideTC) ? info.fideTC : null;
}

// Seções de base e de veteranos: não têm partida de elite e só gastam pedidos ao Lichess.
// Sub-20/Júnior fica (o Mundial Júnior tem GMs de 2600) e piso de rating ("Masters 2200+") também.
const YOUTH = /\b(?:U-?|Under\s?|Sub-?)(?:0?[5-9]|1[0-8])\b|\bGirls\b|\bYouth\b|\bCadets?\b|\bSub-?Junior|\bSeniors?\b|\bVeterans?\b|(?<!\d)[3-9]\d\+/i;

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

/**
 * Comentários de cada lance. A transmissão quebra o lance anotado em três comentários vizinhos
 * ("14... Qc7?? { [%eval 5.81] } { Blunder. Bb7 was best. } { [%clk 0:02:24] }"): ler um item por
 * comentário desalinhava avaliação e relógio. Aqui cada grupo vai para o último lance antes dele.
 */
function commentsByPly(raw) {
  const body = raw.replace(/^(?:\s*\[[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\])+/, ''); // tira as tags
  const out = [];
  let ply = -1;
  let depth = 0; // dentro de variante ( ... ): não conta lance nem comentário
  for (const m of body.matchAll(/\{([^}]*)\}|([()])|([^\s{}()]+)/g)) {
    if (m[2]) {
      depth = Math.max(0, depth + (m[2] === '(' ? 1 : -1));
      continue;
    }
    if (depth) continue;
    if (m[1] != null) {
      if (ply >= 0) out[ply] = out[ply] ? `${out[ply]} ${m[1]}` : m[1];
      continue;
    }
    const t = m[3].replace(/^\d+\.+/, ''); // "14...Qc7" → "Qc7"; "14." → ""
    if (!t || /^\$\d+$/.test(t) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue;
    ply++;
  }
  return { comments: out, plies: ply + 1 };
}

/** [%eval] do comentário em peões (brancas = positivo; mate = ±20). "#0": quem acabou de jogar deu mate. */
function parseEval(c, ply) {
  const e = c?.match(/\[%eval ([^\]\s]+)/)?.[1];
  if (e == null) return null;
  if (e.startsWith('#')) {
    const n = Number(e.slice(1));
    if (!n) return ply % 2 === 0 ? MATE : -MATE;
    return n > 0 ? MATE : -MATE;
  }
  const v = Number(e);
  return Number.isFinite(v) ? Math.max(-MATE, Math.min(MATE, v)) : null;
}

/** Lê um jogo do PGN e calcula o momento decisivo. */
export function analyzeGame(raw, meta = {}) {
  const tag = (k) => raw.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? '';
  const result = tag('Result');
  if (!['1-0', '0-1', '1/2-1/2'].includes(result)) return null; // em andamento: fica para a próxima rodada do robô

  const g = new Chess();
  try {
    g.loadPgn(raw.replace(/\{[^}]*\}/g, ''));
  } catch {
    return null;
  }
  const moves = g.history();
  const { comments, plies } = commentsByPly(raw);
  // contagem diferente da do chess.js = PGN que o leitor não entendeu: sem relógio (não dá para
  // garantir de que lance é), mas a avaliação ainda serve para a pré-seleção
  const aligned = plies === moves.length;
  const evals = moves.map((_, i) => parseEval(comments[i], i));
  const clocks = moves.map((_, i) => {
    const k = aligned ? comments[i]?.match(/\[%clk ([\d:]+)/)?.[1] : null;
    return k ? clockSeconds(k) : null;
  });
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

  // data pela rodada (startsAt): a tag Date de um tabuleiro por rodada vem errada (ex.: 2026.09.26
  // numa rodada de 14/10), então ela só vale quando a rodada não tem horário
  const startsAt = Number.isFinite(meta.startsAt) ? meta.startsAt : undefined;
  return {
    key,
    event: meta.event ?? tag('Event'),
    round: meta.round ?? tag('Round'),
    date: startsAt ? new Date(startsAt).toISOString().slice(0, 10).replace(/-/g, '.') : tag('UTCDate') || tag('Date'),
    startsAt,
    // ritmo do jogo pela tag do PGN; sem ela, o da seção
    tc: tcFromTag(tag('TimeControl')) ?? meta.tc ?? undefined,
    tier: meta.tier ?? undefined,
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

/** Chance de vitória das brancas (0 a 100) pela avaliação em peões: fórmula do Lichess, com cp limitado a ±1000. */
export const winChance = (pawns) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, pawns * 100)))) - 1);

const NO_RETURN = 40; // o perdedor ainda segurava a partida com 40% ou mais de chance
const SWING = 15; // virada: quem jogou perdeu 15+ pontos de chance (o "erro grave" do Lichess)
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Momento decisivo a partir da avaliação lance a lance (brancas = positivo).
 * Vitória: o "ponto sem volta". Depois da última posição em que o perdedor ainda tinha 40% de
 * chance, o lance dele que mais derrubou a própria chance. A maior queda em peões apontava erros
 * que o vencedor devolvia logo depois (Pranav x Khubukshanov, Bizhigitov x Smirnov).
 * Empate: a maior vantagem (1,5+) que o próprio dono jogou fora.
 * swings: até 3 outras viradas (de qualquer lado), na ordem da partida.
 */
export function keyMoment(ev, result) {
  const before = (i) => (i === 0 ? 0.2 : ev[i - 1]);
  let keyPly = -1;
  let keyKind = 'erro';
  if (result !== '1/2-1/2') {
    const loserIsWhite = result === '0-1';
    const lose = (e) => (loserIsWhite ? winChance(e) : 100 - winChance(e)); // chance do perdedor
    let last = -1;
    for (let i = 0; i < ev.length; i++) if (lose(ev[i]) >= NO_RETURN) last = i;
    let best = 0;
    for (let i = last + 1; i < ev.length; i++) {
      if ((i % 2 === 0) !== loserIsWhite) continue;
      const drop = lose(before(i)) - lose(ev[i]);
      if (drop > best) {
        best = drop;
        keyPly = i;
      }
    }
    // plano B: nenhum lance do perdedor depois do ponto sem volta (perdeu no tempo ou desistiu em
    // posição ainda jogável). Vale a regra antiga: a maior queda em peões antes de estar perdido
    if (keyPly < 0) {
      const pov = loserIsWhite ? 1 : -1;
      best = 0;
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
    }
  } else {
    keyKind = 'chance';
    let best = 0;
    for (let i = 0; i < ev.length; i++) {
      // do ponto de vista de quem jogou: lance que AUMENTOU a vantagem do outro não é "vantagem perdida" dele
      const pov = i % 2 === 0 ? 1 : -1;
      const b = Math.max(-6, Math.min(6, before(i))) * pov;
      const drop = b - Math.max(-6, Math.min(6, ev[i])) * pov;
      if (drop > best && drop >= 2 && b >= 1.5) {
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
    if (worst <= -2.5) comeback = r1(worst);
  }
  const swings = [];
  for (let i = 0; i < ev.length; i++) {
    if (i === keyPly) continue;
    const drop = (winChance(before(i)) - winChance(ev[i])) * (i % 2 === 0 ? 1 : -1); // queda para quem jogou
    if (drop >= SWING) swings.push({ ply: i, before: r1(before(i)), after: r1(ev[i]), drop });
  }
  return {
    keyPly,
    keyKind,
    keyBefore: r1(before(keyPly)),
    keyAfter: r1(ev[keyPly]),
    comeback,
    swings: swings
      .sort((a, b) => b.drop - a.drop)
      .slice(0, 3)
      .sort((a, b) => a.ply - b.ply)
      .map(({ drop, ...s }) => s),
  };
}

/** Fase da partida na posição: final com até 6 peças (sem contar reis e peões); abertura com tudo ainda em casa. */
export function gamePhase(fen, ply) {
  let pieces = 0;
  let whiteBack = 0;
  let blackBack = 0;
  new Chess(fen).board().forEach((row, r) =>
    row.forEach((sq) => {
      if (!sq) return;
      if (sq.type !== 'p' && sq.type !== 'k') pieces++;
      if (r === 7 && sq.color === 'w') whiteBack++;
      if (r === 0 && sq.color === 'b') blackBack++;
    }),
  );
  // mesmos cortes do Lichess (Divider): fim da abertura com 10 peças ou menos ou a 1ª fileira esvaziando
  if (pieces <= 6) return 'final';
  if (pieces > 10 && whiteBack >= 4 && blackBack >= 4 && ply < 40) return 'abertura';
  return 'meio-jogo';
}

/**
 * Precisão de cada jogador pela fórmula do Lichess: precisão de cada lance pela chance de vitória
 * perdida, e a nota é a média entre a média ponderada (peso = volatilidade da posição) e a harmônica.
 */
export function accuracy(ev) {
  if (ev.length < 2) return null;
  const wins = [winChance(0.15), ...ev.map(winChance)];
  const size = Math.max(2, Math.min(8, Math.floor(ev.length / 10)));
  const windows = Array.from({ length: Math.max(0, Math.min(size, wins.length) - 2) }, () => wins.slice(0, size));
  for (let i = 0; i + size <= wins.length; i++) windows.push(wins.slice(i, i + size));
  const weights = windows.map((w) => {
    const m = w.reduce((s, x) => s + x, 0) / w.length;
    return Math.max(0.5, Math.min(12, Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / w.length)));
  });
  const per = { white: [], black: [] };
  for (let i = 0; i < ev.length; i++) {
    const white = i % 2 === 0;
    const b = white ? wins[i] : 100 - wins[i];
    const a = white ? wins[i + 1] : 100 - wins[i + 1];
    // +1: folga do Lichess pela análise imperfeita
    const acc = a >= b ? 100 : Math.max(0, Math.min(100, 103.1668100711649 * Math.exp(-0.04354415386753951 * (b - a)) - 3.166924740191411 + 1));
    per[white ? 'white' : 'black'].push([acc, weights[i] ?? 0.5]);
  }
  const score = (xs) => {
    if (!xs.length) return null;
    const weighted = xs.reduce((s, [a, w]) => s + a * w, 0) / xs.reduce((s, [, w]) => s + w, 0);
    const harmonic = xs.length / xs.reduce((s, [a]) => s + 1 / Math.max(1, a), 0);
    return Math.round((weighted + harmonic) / 2);
  };
  const white = score(per.white);
  const black = score(per.black);
  return white == null || black == null ? null : { white, black };
}

const ENGINE_DEPTH = 12; // ~4 s por partida no GitHub; basta para achar o erro decisivo
const ENGINE_GAMES = 24; // quantas partidas (as mais notícia) passam pelo Stockfish por execução
const KEY_DEPTH = 16; // os números mostrados no momento decisivo saem de análise mais funda
// Cache de TODAS as partidas analisadas (não só as publicadas), guardado pelo actions/cache entre
// execuções: partida terminada não muda, e reanalisar as 24 custava ~3 min por execução.
// Fica fora do site: o app não baixa isso. Guarda também "sem momento decisivo", para não repetir.
const ENGINE_CACHE = new URL('engine.json', CACHE_DIR);
const ENGINE_CACHE_MAX = 400;
// Versão da análise: entrada do cache (ou do digest anterior) com outra versão é refeita.
// 2: ponto sem volta pela chance de vitória, melhor lance, refutação, alternativas, fase, precisão
// 3: motor zerado a cada partida e sincronizado a cada busca; avaliação suspeita refeita na funda
//    (a 2 publicou números trocados: pranav-giri com −2,3 depois de 1.e4 e "erro" em 1…e6)
const ANALYSIS = 3;
const MAX_SUSPECTS = 8; // posições suspeitas refeitas por partida (cada uma ~1 s na profundidade 16)

/**
 * Lances cuja avaliação não parece real: o 1º lance longe do equilíbrio, ou um pico de um lance só
 * que some no lance seguinte (A → B → A). Não conta mate dos dois lados (±20 seguidos é real).
 */
function suspects(ev) {
  const out = [];
  if (ev.length && Math.abs(ev[0]) > 1) out.push(0);
  for (let i = 1; i < ev.length - 1; i++) {
    const jump = Math.abs(ev[i] - ev[i - 1]);
    const back = Math.abs(ev[i + 1] - ev[i - 1]);
    if (jump >= 1.5 && back < 0.6 && Math.abs(ev[i - 1]) < MATE) out.push(i);
  }
  return out.slice(0, MAX_SUSPECTS);
}
const ALT_MS = 3000; // teto do MultiPV 3 no desafio (sem teto, uma busca com 3 linhas levou 60 s)
const DEEP_PASSES = 3; // voltas da análise funda até o lance decisivo parar de mudar
// Teto do Stockfish por execução. A 1ª execução depois de mudar ANALYSIS refaz o cache inteiro
// (~13 s por partida); o que não couber fica com a análise antiga e é refeito na próxima.
const ENGINE_MS = 4 * 60_000;
// campos que saem da análise do Stockfish (o resto da partida vem sempre da busca de agora)
const ANALYSIS_FIELDS = ['evals', 'keyPly', 'keyKind', 'keyBefore', 'keyAfter', 'comeback', 'swings', 'keyBest', 'keyRefute', 'keyAlts', 'keyMateIn', 'phase', 'accuracy', 'engine', 'analysis'];
const clockBefore = (clocks, ply) => (ply >= 2 ? clocks?.[ply - 2] ?? null : null);

/** Aproveita a análise guardada; o relógio sai sempre do PGN de agora (o antigo vinha desalinhado). */
function reuse(g, saved) {
  const out = { ...g };
  // campo que a análise guardada não tem (versão anterior) não pode vir da avaliação da transmissão
  for (const f of ANALYSIS_FIELDS) {
    if (saved[f] !== undefined) out[f] = saved[f];
    else delete out[f];
  }
  out.keyClock = clockBefore(g.clocks, out.keyPly);
  return out;
}

/** Análise funda de uma partida já avaliada lance a lance (ev): números do momento decisivo e o que o app explica. */
async function deepAnalysis(g, fens, ev, k, engine) {
  // confirma os números do momento decisivo (e dos vizinhos) com análise funda; se o momento mudar
  // de lugar, repete em volta do novo até ele parar (antes os números ficavam os da profundidade 12)
  const deepAt = new Map(); // índice do fen → análise funda
  const at = async (i) => {
    if (!deepAt.has(i)) deepAt.set(i, await engine.analyse(fens[i], { depth: KEY_DEPTH }));
    return deepAt.get(i);
  };
  for (let pass = 0; pass < DEEP_PASSES && k; pass++) {
    const ply = k.keyPly;
    for (let i = Math.max(0, ply - 2); i <= Math.min(ev.length - 1, ply + 1); i++) {
      const known = deepAt.has(i + 1);
      const a = await at(i + 1);
      if (!known && a.score != null) ev[i] = a.score;
    }
    k = keyMoment(ev, g.result);
    if (k?.keyPly === ply) break;
  }
  if (!k) return null;
  const p = k.keyPly;
  const pre = await at(p); // posição antes do lance decisivo
  const post = await at(p + 1); // posição do desafio: depois do erro, vez de quem pune
  const keyBest = pre.bestmove && pre.bestmove !== g.moves[p] ? { san: pre.bestmove, line: pre.pv.slice(0, 6), eval: r1(pre.score ?? ev[p - 1] ?? 0) } : null;
  const punisherIsWhite = p % 2 === 1;
  const keyMateIn = post.mateIn && (post.mateIn > 0) === punisherIsWhite ? Math.abs(post.mateIn) : null;
  // lances que também ganham no desafio: até 0,5 do melhor ou, com o melhor acima de +3, os que
  // mantêm +3 (do lado de quem pune). O lance da partida é a resposta principal e fica de fora
  let keyAlts = [];
  if (k.keyKind === 'erro' && p + 1 < g.moves.length) {
    const multi = await engine.analyse(fens[p + 1], { depth: KEY_DEPTH, multipv: 3, movetime: ALT_MS });
    const pov = punisherIsWhite ? 1 : -1;
    const lines = multi.lines.filter((l) => l.score != null).map((l) => ({ san: l.san, v: l.score * pov }));
    const top = lines[0]?.v;
    if (top != null) keyAlts = lines.filter((l) => l.san !== g.moves[p + 1] && (l.v >= top - 0.5 || (top > 3 && l.v >= 3))).map((l) => l.san);
  }
  return {
    evals: ev.map(r1),
    ...k,
    keyBest,
    keyRefute: post.pv.slice(0, 5),
    keyAlts,
    keyMateIn,
    phase: gamePhase(fens[p], p),
    accuracy: accuracy(ev),
  };
}

/** Análise completa de uma partida (campos de ANALYSIS_FIELDS, sem engine/analysis); null se não houver momento decisivo. */
async function analyseGame(g, engine) {
  const ch = new Chess();
  const fens = [ch.fen()];
  for (const m of g.moves) {
    ch.move(m);
    fens.push(ch.fen());
  }
  await engine.newGame();
  const ev = [];
  for (let i = 1; i < fens.length; i++) ev.push((await engine.evaluate(fens[i])) ?? ev[i - 2] ?? 0.2);
  // número suspeito não vira "erro decisivo" sem confirmação na análise funda
  for (const i of suspects(ev)) {
    const a = await engine.analyse(fens[i + 1], { depth: KEY_DEPTH });
    if (a.score != null) ev[i] = a.score;
  }
  const k = keyMoment(ev, g.result);
  return k ? deepAnalysis(g, fens, ev, k, engine) : null;
}

/**
 * Refaz a análise das partidas antigas do arquivo (src/data/partidas.json, restaurado do site) que
 * ainda estão numa versão anterior, as mais recentes primeiro, até o tempo acabar. O archive.mjs
 * publica o arquivo de volta. Sem isso, a partida que já saiu do digest (ex.: pranav-giri) ficaria
 * para sempre com a análise errada.
 */
export async function refreshArchived(budgetMs = 90_000) {
  const file = new URL('../src/data/partidas.json', import.meta.url);
  let saved;
  try {
    saved = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return 0;
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return 0;
  const todo = Object.entries(saved)
    .filter(([, g]) => g && Array.isArray(g.moves) && g.analysis !== ANALYSIS)
    .sort((a, b) => String(b[1].seen ?? '').localeCompare(String(a[1].seen ?? '')));
  if (!todo.length) return 0;
  const engine = await createEngine({ depth: ENGINE_DEPTH });
  const t0 = Date.now();
  let done = 0;
  try {
    for (const [key, g] of todo) {
      if (Date.now() - t0 > budgetMs) break;
      try {
        const a = await analyseGame(g, engine);
        if (a) {
          // relógio do lance decisivo: o arquivo não guarda os relógios lance a lance
          saved[key] = { ...g, ...a, keyClock: a.keyPly === g.keyPly ? g.keyClock ?? null : null, engine: 'Stockfish 19', analysis: ANALYSIS };
        } else {
          // sem momento decisivo na análise certa: o "erro" antigo não pode continuar publicado.
          // O archive.mjs tira do partidas.json a entrada marcada com none (o app diz "não encontrada")
          saved[key] = { key, none: true, analysis: ANALYSIS, seen: g.seen };
        }
        done++;
      } catch (e) {
        console.warn(`  arquivo: Stockfish falhou em ${key}: ${e.message}`);
      }
    }
  } finally {
    engine.quit();
  }
  writeFileSync(file, JSON.stringify(saved));
  console.log(`arquivo de partidas: ${done} reanalisadas, ${todo.length - done} ficam para a próxima`);
  return done;
}

/**
 * Reavalia as partidas com o nosso Stockfish e recalcula o momento decisivo.
 * Partida que já foi analisada numa execução anterior (mesmos lances, mesma versão) reaproveita o resultado.
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
    for (const g of prev.games ?? []) {
      const c = cache.get(g.key);
      if (g.engine === 'Stockfish 19' && (!c || (c.analysis !== ANALYSIS && g.analysis === ANALYSIS))) cache.set(g.key, g);
    }
  } catch {
    // sem digest anterior: analisa tudo
  }
  let hits = 0;
  let stale = 0;
  let skipped = 0;
  // usada agora vai para o fim da fila: o corte do cache tira as que ninguém usa há mais tempo
  const touch = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
  };
  // um motor só: evaluate() na profundidade 12 e analyse() na 16. Dois processos do Stockfish WASM
  // ao mesmo tempo derrubam um deles no Windows, e as buscas são uma de cada vez de qualquer jeito
  const engine = await createEngine({ depth: ENGINE_DEPTH });
  const out = [];
  const t0 = Date.now();
  try {
    for (const g of games) {
      const old = cache.get(g.key);
      const same = old && (old.moves?.length ?? old.plies) === g.moves.length;
      if (same && old.analysis === ANALYSIS) {
        hits++;
        touch(g.key, old);
        if (!old.none) out.push(reuse(g, old));
        continue;
      }
      // sem tempo: fica a análise da versão anterior, se houver (a lista já vem na ordem de importância)
      if (Date.now() - t0 > ENGINE_MS) {
        if (same && !old.none) {
          stale++;
          out.push(reuse(g, old));
        } else skipped++;
        continue;
      }
      // "sem momento decisivo" também vai para o cache (a partida é igual na próxima execução)
      const none = () => touch(g.key, { key: g.key, plies: g.moves.length, none: true, analysis: ANALYSIS });
      try {
        const a = await analyseGame(g, engine);
        if (!a) {
          none();
          continue;
        }
        out.push({ ...g, ...a, keyClock: clockBefore(g.clocks, a.keyPly), engine: 'Stockfish 19', analysis: ANALYSIS });
      } catch (e) {
        console.warn(`  Stockfish falhou em ${g.key}: ${e.message}`);
      }
    }
  } finally {
    engine.quit();
  }
  // clocks só servem para o relógio do lance decisivo: não vão para o digest
  const result = out.map(({ clocks, ...g }) => g);
  const fresh = games.length - hits - stale - skipped;
  console.log(
    `Stockfish: ${fresh} analisadas agora em ${Math.round((Date.now() - t0) / 1000)} s, ${hits} do cache` +
      (stale || skipped ? `; sem tempo: ${stale} com a análise antiga, ${skipped} de fora` : ''),
  );
  try {
    for (const g of result) if (g.analysis === ANALYSIS) touch(g.key, g);
    mkdirSync(CACHE_DIR, { recursive: true });
    // as mais novas ficam (a Map guarda a ordem de inserção)
    writeFileSync(ENGINE_CACHE, JSON.stringify([...cache.values()].slice(-ENGINE_CACHE_MAX)));
  } catch (e) {
    console.warn(`cache do Stockfish não gravado: ${e.message}`);
  }
  return result;
}

const startOf = (g) => g.startsAt ?? Date.parse(String(g.date ?? '').replace(/\./g, '-'));

/**
 * Quão "notícia" é a partida: força (média de Elo) + equilíbrio + drama + resultado + frescor.
 * O maior Elo premiava 2600 contra 2050 (o mais fraco erra feio e a variação dispara); agora conta
 * a média, a diferença acima de 250 desconta e a variação tem teto.
 */
export function gameScore(g, topSurnames = []) {
  const avg = (g.whiteElo + g.blackElo) / 2;
  const gap = Math.abs(g.whiteElo - g.blackElo);
  const swing = Math.abs(Math.max(-6, Math.min(6, g.keyBefore)) - Math.max(-6, Math.min(6, g.keyAfter)));
  const top = [g.whiteSurname, g.blackSurname].filter((s) => topSurnames.includes(String(s).toLowerCase())).length * 60;
  const result = g.result === '1/2-1/2' ? (g.keyKind === 'chance' ? 10 : 0) : 25;
  // −8 a cada 12 h desde o começo da rodada (hora cheia no minuto: a nota não muda durante o sort)
  const start = startOf(g);
  const age = Number.isFinite(start) ? Math.max(0, Math.floor(Date.now() / 60_000) * 60_000 - start) / H : 0;
  const pace = g.tc === 'blitz' ? 60 : g.tc === 'rapid' ? 30 : 0;
  return (avg - 2400) / 2 - Math.max(0, gap - 250) / 2 + Math.min(swing, 4) * 8 + result + (g.comeback != null ? 25 : 0) + top + (g.tier >= 5 ? 40 : 0) - (age / 12) * 8 - pace;
}

// Destaque é só elite: ritmo clássico, menor Elo 2400+ e média 2500+. A seção feminina tem barra
// própria (2350+ e média 2425+): com a do aberto, quase nenhuma partida feminina passaria, e a
// ideia é o feminino não sumir atrás do aberto. Blitz e rápida só entram ligadas a notícia.
const ELITE = { min: 2400, avg: 2500 };
const ELITE_WOMEN = { min: 2350, avg: 2425 };
export function isElite(g) {
  const bar = /\b(Feminino|Women|Ladies)\b/i.test(g.event ?? '') ? ELITE_WOMEN : ELITE;
  return g.tc === 'standard' && Math.min(g.whiteElo, g.blackElo) >= bar.min && (g.whiteElo + g.blackElo) / 2 >= bar.avg;
}

/** Uma passada pela lista (já na ordem da nota): até 1 partida por jogador (2 se do Top 10) e 3 por evento. */
function pickFeatured(pool, topSurnames, cap) {
  const perPlayer = new Map();
  const perEvent = new Map();
  const out = [];
  for (const g of pool) {
    if (out.length >= cap) break;
    const players = [
      [g.white, g.whiteSurname],
      [g.black, g.blackSurname],
    ];
    const full = players.some(([name, sur]) => (perPlayer.get(name) ?? 0) >= (topSurnames.includes(String(sur).toLowerCase()) ? 2 : 1));
    if (full || (perEvent.get(g.event) ?? 0) >= 3) continue;
    out.push(g);
    for (const [name] of players) perPlayer.set(name, (perPlayer.get(name) ?? 0) + 1);
    perEvent.set(g.event, (perEvent.get(g.event) ?? 0) + 1);
  }
  return out;
}

/** "Partidas do dia" (3+ de elite nas últimas 30 h) ou "Partidas recentes" (até 6 das últimas 72 h). */
function chooseFeatured(games, topSurnames, limit = MAX_FEATURED) {
  const now = Date.now();
  const score = new Map(games.map((g) => [g.key, gameScore(g, topSurnames)]));
  const elite = games.filter(isElite).sort((a, b) => score.get(b.key) - score.get(a.key));
  const day = pickFeatured(
    elite.filter((g) => startOf(g) >= now - DAY_HOURS * H),
    topSurnames,
    limit,
  );
  if (day.length >= DAY_MIN) return { featured: day, mode: 'dia' };
  const recent = pickFeatured(
    elite.filter((g) => startOf(g) >= now - HOURS * H),
    topSurnames,
    Math.min(limit, MAX_RECENT),
  );
  return { featured: recent, mode: 'recentes' };
}

/**
 * A busca falhou: as partidas da execução anterior ficam, mas o que passou de 72 h sai do destaque
 * (com o Lichess bloqueando, o robô chegou a republicar por dias as mesmas partidas como "do dia").
 * all: todas as anteriores, para as notícias ainda acharem a partida delas.
 */
export function staleGames(prevGames = []) {
  const now = Date.now();
  const list = (Array.isArray(prevGames) ? prevGames : []).filter((g) => g?.key);
  const all = list.map(({ linked, ...g }) => g);
  const was = new Set(list.filter((g) => !g.linked).map((g) => g.key));
  // edição anterior à análise 2 não tem tc: o ritmo sai do nome da seção ("· Blitz Men"); e os
  // mesmos critérios de elite e de limite por jogador/evento da busca normal (nada de blitz repetido)
  const tcOfName = (s) => (/\b(blitz|bullet|armageddon)\b/i.test(s) ? 'blitz' : /\brapid\b/i.test(s) ? 'rapid' : 'standard');
  const shown = all.filter((g) => was.has(g.key) && isElite(g.tc ? g : { ...g, tc: tcOfName(g.event ?? '') }));
  const day = pickFeatured(shown.filter((g) => startOf(g) >= now - DAY_HOURS * H), [], MAX_FEATURED);
  const featured = day.length >= DAY_MIN ? day : pickFeatured(shown.filter((g) => startOf(g) >= now - HOURS * H), [], MAX_RECENT);
  const newest = Math.max(...all.map(startOf).filter(Number.isFinite));
  return {
    featured,
    all,
    mode: day.length >= DAY_MIN ? 'dia' : 'recentes',
    dropped: was.size - featured.length,
    newest: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
  };
}

// partidas a mais, além das ENGINE_GAMES, só porque o jogador aparece nas notícias do dia
const NEWS_GAMES = 30;

/**
 * Rodadas das últimas 72 h nos eventos de elite (tier 4 e 5), incluindo as seções irmãs (ex.: feminino).
 * newsText: manchetes e resumos do dia. Partida de jogador citado nas notícias também passa pelo
 * Stockfish, mesmo fora das mais fortes: a notícia sobre ela mostra o jogo (não vira "Partidas do dia").
 * Falha num torneio, numa seção ou numa rodada pula só aquele pedaço.
 */
export async function fetchRecentGames({ topSurnames = [], limit = MAX_FEATURED, newsText = '' } = {}) {
  Object.assign(lichessState, { nextAt: 0, waits: 0, blocked: false, timedOut: false, t0: Date.now(), calls: 0, fromCache: 0 });
  pruneCache();
  const now = Date.now();
  const since = now - HOURS * H;
  let failed = 0;
  const fail = (what, e) => {
    failed++;
    if (!e.quiet) console.warn(`  ${what}: ${e.message}`);
  };

  const tours = new Map();
  let pages = 0;
  for (const page of [1, 2]) {
    try {
      const top = await lichess(`https://lichess.org/api/broadcast/top?page=${page}`);
      pages++;
      for (const b of [...(top.active ?? []), ...(top.past?.currentPageResults ?? [])]) {
        const t = b.tour;
        if (!t?.id || (t.tier ?? 0) < 4 || YOUTH.test(t.name ?? '')) continue;
        // sem datas (ex.: TCEC) fica; acabou antes da janela ou ainda não começou, sai sem pedido nenhum
        const dates = Array.isArray(t.dates) ? t.dates : [];
        if (dates.length && (dates.at(-1) < since || dates[0] > now)) continue;
        tours.set(t.id, t.name);
      }
    } catch (e) {
      fail(`torneios (página ${page})`, e);
    }
  }
  if (!pages) throw new Error('lista de torneios do Lichess indisponível');

  const rounds = [];
  const seenTours = new Set();
  for (const [id, name] of tours) {
    if (seenTours.has(id)) continue;
    try {
      const info = await tourInfo(id);
      // seções do mesmo evento: só a primeira faixa de mesas de cada seção (onde estão os fortes),
      // e nada de base nem veteranos (pelo nome, antes de gastar o pedido)
      const siblings = (
        info.group?.tours?.filter((t) => /(^|\| )(Matches 1-|Boards? 1-)/i.test(t.name) || !/Matches|Boards?/i.test(t.name)) ?? [{ id, name }]
      ).filter((t) => t.id === id || !YOUTH.test(t.name ?? ''));
      for (const sib of siblings) {
        if (seenTours.has(sib.id)) continue;
        seenTours.add(sib.id);
        try {
          const tinfo = sib.id === id ? info : await tourInfo(sib.id);
          // o tier é de cada seção: o blitz ou o sub-17 de um evento tier 4 não herdam o tier dele
          if ((tinfo.tour?.tier ?? 0) < 4) continue;
          const event = info.group?.name ?? tinfo.tour.name;
          // "46th ... 2026 | Women | Matches 1-25" → "Women"
          const section = info.group
            ? tinfo.tour.name.split('|').map((x) => x.trim()).filter((x) => x && !/Matches|Boards?/i.test(x) && !x.includes(event)).join(' ')
            : '';
          const sectionPt = section.replace(/^Open$/i, 'Aberto').replace(/^Women$/i, 'Feminino');
          for (const r of tinfo.rounds ?? []) {
            if ((r.startsAt ?? 0) >= since && (r.finished || r.ongoing)) {
              const round = r.name.replace(/^Round\b/i, 'Rodada').replace(/^Game\b/i, 'Partida').replace(/\bFinals?\b/i, 'Final');
              rounds.push({
                id: r.id,
                event: sectionPt ? `${event} · ${sectionPt}` : event,
                round,
                startsAt: r.startsAt,
                finished: !!r.finished,
                finishedAt: r.finishedAt,
                tier: tinfo.tour.tier,
                // ritmo da seção (cada jogo ainda confere a tag TimeControl): rodada "Armageddon" ou seção "Blitz" mudam
                tc: tcFromInfo(tinfo.tour.info, `${info.group ? section : tinfo.tour.name} ${r.name}`),
              });
            }
          }
        } catch (e) {
          fail(`seção ${sib.name ?? sib.id}`, e);
        }
      }
    } catch (e) {
      fail(`torneio ${name}`, e);
    }
  }

  const games = [];
  let cachedRounds = 0;
  for (const r of rounds) {
    try {
      const { pgn, cached } = await roundPgn(r);
      if (cached) cachedRounds++;
      for (const raw of pgn.split(/\n\n(?=\[Event )/)) {
        const g = analyzeGame(raw, { event: r.event, round: r.round, startsAt: r.startsAt, tier: r.tier, tc: r.tc });
        if (g && Math.max(g.whiteElo, g.blackElo) >= 2450) games.push(g);
      }
    } catch (e) {
      fail(`rodada ${r.id}`, e);
    }
  }
  const { calls, blocked, timedOut, fromCache } = lichessState;
  console.log(
    `Lichess: ${calls} pedidos${failed ? `, ${failed} falharam` : ''}${blocked ? ' (bloqueado: HTTP 429)' : timedOut ? ' (tempo esgotado)' : ''}` +
      `, ${cachedRounds} de ${rounds.length} rodadas do cache${fromCache ? `, ${fromCache} torneios com os dados da execução anterior` : ''}`,
  );
  // nada para mostrar e o Lichess falhou: quem chama mantém as partidas anteriores
  if (!games.length && failed) throw new Error(`nenhuma partida baixada (${failed} pedidos falharam${blocked ? ', HTTP 429' : ''})`);

  const candidates = [...new Map(games.map((g) => [g.key, g])).values()];
  // pré-seleção pela avaliação da transmissão: primeiro as que podem ir para o destaque (elite em
  // ritmo clássico), depois as outras. As escolhidas (e todas com jogador do Top 10 ou citado nas
  // notícias) são reanalisadas pelo nosso Stockfish, e só essas podem ser publicadas ou ligadas a notícias
  const score = new Map(candidates.map((g) => [g.key, gameScore(g, topSurnames)]));
  candidates.sort((a, b) => isElite(b) - isElite(a) || score.get(b.key) - score.get(a.key));
  const withTop = (g) => [g.whiteSurname, g.blackSurname].some((s) => topSurnames.includes(s.toLowerCase()));
  const cited = (s) => s.length >= 4 && new RegExp(`(^|[^\\p{L}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(newsText);
  let extra = 0;
  const inNews = (g) => !!newsText && extra < NEWS_GAMES && (cited(g.whiteSurname) || cited(g.blackSurname)) && ++extra > 0;
  const toAnalyze = candidates.filter((g, i) => i < ENGINE_GAMES || withTop(g) || inNews(g));
  if (extra) console.log(`Stockfish: ${extra} partidas a mais de jogadores citados nas notícias`);
  const unique = await analyzeWithEngine(toAnalyze);
  console.log(`Stockfish: ${unique.length} de ${toAnalyze.length} partidas com momento decisivo`);
  const { featured, mode } = chooseFeatured(unique, topSurnames, limit);
  console.log(
    `partidas: ${rounds.length} rodadas, ${games.length} jogos, ${unique.filter(isElite).length} de elite em ritmo clássico, ${featured.length} em destaque (${mode === 'dia' ? 'do dia' : 'recentes'})`,
  );
  // partial: o Lichess parou de responder no meio (rodada nova pode ter ficado de fora); o digest
  // publica o que saiu, mas marca as partidas como desatualizadas
  return { featured, all: unique, mode, partial: blocked || timedOut };
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
  Hungary: ['Hungary', 'Hungria'],
  Georgia: ['Georgia', 'Geórgia'],
  Ukraine: ['Ukraine', 'Ucrânia'],
  Turkiye: ['Turkiye', 'Türkiye', 'Turkey', 'Turquia'],
  Italy: ['Italy', 'Itália'],
  Poland: ['Poland', 'Polônia'],
  Vietnam: ['Vietnam', 'Vietnã'],
  Azerbaijan: ['Azerbaijan', 'Azerbaijão'],
  Argentina: ['Argentina'],
};

/**
 * Acha a partida de que a notícia fala: os dois jogadores citados > um jogador > as duas seleções > uma seleção.
 * Entre as candidatas do mesmo nível, a mais dramática.
 */
export function linkGame(text, games, topSurnames = [], when = null) {
  const has = (w) => w && w.length >= 3 && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text);
  const team = (t) => (t ? (TEAM_ALIASES[t] ?? [t]).some(has) : false);
  // citar um jogador só liga a partida se a notícia fala de jogo (um homenageado num prêmio, por exemplo, não)
  const aboutPlay = /\b(beats?|defeat\w*|won|wins?|draws?|drew|game|round|swindl\w*|clinch\w*|hero|venc\w*|derrot\w*|empat\w*|partida|rodada|virada|vitória|ouro|gold)\b/i.test(text);
  // jogadores conhecidos citados na notícia (das partidas analisadas e do Top 10)
  const known = new Set([...games.flatMap((g) => [g.whiteSurname, g.blackSurname]), ...topSurnames].filter((n) => n && n.length >= 4).map((n) => n.toLowerCase()));
  const mentioned = [...known].filter(has);
  // seleção de cada jogador, pelas partidas analisadas (vale na Olimpíada e em outros torneios por equipes)
  const teamOf = new Map();
  for (const g of games) {
    if (g.whiteTeam) teamOf.set(g.whiteSurname.toLowerCase(), g.whiteTeam);
    if (g.blackTeam) teamOf.set(g.blackSurname.toLowerCase(), g.blackTeam);
  }
  // "9ª rodada", "rodada 9", "round 9", "R9": a partida tem que ser dessa rodada
  // várias rodadas citadas (ex.: "R9" e "Rounds 10–11") = qualquer uma delas vale
  const rounds = new Set();
  for (const m of text.matchAll(/(?:rodadas?|rounds?)\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?|\b(\d{1,2})\s*[ªºa]?\s*rodada|\bR(\d{1,2})\b/gi)) {
    const a = Number(m[1] ?? m[3] ?? m[4]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b && n - a < 12; n++) rounds.add(n);
  }
  // seleções citadas na notícia ("Índia vence a Inglaterra"): partida de outra seleção é outro jogo
  const allTeams = new Set([...Object.keys(TEAM_ALIASES), ...games.flatMap((g) => [g.whiteTeam, g.blackTeam]).filter(Boolean)]);
  const mentionedTeams = [...allTeams].filter(team);
  // a notícia sai depois do jogo: até 2 dias (7 se cita os dois jogadores); 6 h de folga para fuso e horário
  const published = when ? Date.parse(when) : NaN;
  const startOf = (g) => g.startsAt ?? Date.parse(String(g.date ?? '').replace(/\./g, '-'));
  const inTime = (g, days) => {
    if (!Number.isFinite(published) || !Number.isFinite(startOf(g))) return true;
    const hours = (published - startOf(g)) / 3_600_000;
    return hours >= -6 && hours <= days * 24;
  };
  const level = (g) => {
    if (rounds.size && !rounds.has(Number(String(g.round).match(/\d+/)?.[0]))) return 0;
    const w = g.whiteSurname.length >= 4 && has(g.whiteSurname);
    const b = g.blackSurname.length >= 4 && has(g.blackSurname);
    if (w && b) return inTime(g, 7) ? 4 : 0;
    if (!aboutPlay || !inTime(g, 2)) return 0;
    if (mentionedTeams.some((t) => t !== g.whiteTeam && t !== g.blackTeam)) return 0;
    // a notícia cita outro jogador que não está nesta partida: é outro jogo, a não ser que seja
    // colega de seleção ("Gukesh e Praggnanandhaa lideram a Índia"): aí é o mesmo match
    const players = [g.whiteSurname.toLowerCase(), g.blackSurname.toLowerCase()];
    const teams = [g.whiteTeam, g.blackTeam].filter(Boolean);
    if (mentioned.some((n) => !players.includes(n) && !(teams.length && teams.includes(teamOf.get(n))))) return 0;
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
