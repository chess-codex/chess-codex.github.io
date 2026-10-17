import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ARQUIVO_URL, SITE_URL } from '@/data/config';
import legacy from '@/data/games.json';
import { useStore } from './store';

// Partida com a posição decisiva já calculada pelo robô (scripts/games.mjs).
// Os campos da análise nova (analysis 2) são opcionais: digest antigo, edição de exemplo e
// partidas republicadas quando a busca falha chegam sem eles, e o texto cai no formato antigo.
export type Game = {
  key: string;
  event: string;
  round: string;
  date?: string;
  white: string;
  black: string;
  whiteSurname: string;
  blackSurname: string;
  whiteElo: number;
  blackElo: number;
  whiteTeam?: string;
  blackTeam?: string;
  result: string;
  opening?: string;
  eco?: string;
  url: string;
  moves: string[];
  evals: number[];
  keyPly: number;
  keyKind: 'erro' | 'chance';
  keyBefore: number;
  keyAfter: number;
  keyClock: number | null;
  comeback: number | null;
  // veio só porque uma notícia fala dela: aparece na notícia, não em "Partidas do dia"
  linked?: boolean;
  // início da rodada (ms): a data confiável da partida; a tag Date do PGN às vezes vem errada
  startsAt?: number;
  tc?: 'standard' | 'rapid' | 'blitz';
  // fase no lance decisivo
  phase?: 'abertura' | 'meio-jogo' | 'final';
  // melhor lance na posição antes do erro, com a linha em SAN (avaliação pelo lado das brancas)
  keyBest?: { san: string; line: string[]; eval: number } | null;
  // refutação: linha do motor na posição depois do erro (o 1º lance é a resposta do desafio)
  keyRefute?: string[];
  // outros lances que também ganham na posição do desafio
  keyAlts?: string[];
  // mate em N para quem pune o erro, na posição depois dele
  keyMateIn?: number | null;
  // outras viradas da partida, além do lance decisivo
  swings?: { ply: number; before: number; after: number }[];
  accuracy?: { white: number; black: number } | null;
  // 'Stockfish 19' = análise nossa; 'transmissão' ou ausente = avaliações do PGN da transmissão
  engine?: string;
  analysis?: number;
};

// Estado das partidas no digest (o robô grava): "do dia" ou "recentes", e se a busca falhou
export type GamesInfo = { mode: 'dia' | 'recentes'; stale: boolean; updatedAt: string };

type Legacy = {
  white: string; black: string; whiteElo: string; blackElo: string; whiteTeam?: string; blackTeam?: string;
  result: string; opening: string; url: string; moves: string[]; evals: number[]; turningPly: number;
};

const last = (n: string) => n.split(',')[0].trim().replace(/ D$/, '');
const full = (n: string) => {
  const [l, f] = n.split(',').map((s) => s.trim());
  return f ? `${f} ${l}` : l;
};

// Partidas da edição de exemplo, no formato novo
const LEGACY: Record<string, Game> = Object.fromEntries(
  Object.entries(legacy as Record<string, Legacy>).map(([key, g]) => [
    key,
    {
      key,
      event: 'Olimpíada de Xadrez 2026',
      round: 'Rodada 9',
      white: full(g.white),
      black: full(g.black),
      whiteSurname: last(g.white),
      blackSurname: last(g.black),
      whiteElo: Number(g.whiteElo),
      blackElo: Number(g.blackElo),
      whiteTeam: g.whiteTeam,
      blackTeam: g.blackTeam,
      result: g.result,
      opening: g.opening,
      url: g.url,
      moves: g.moves,
      evals: g.evals,
      keyPly: g.turningPly,
      keyKind: g.result === '1/2-1/2' ? 'chance' : 'erro',
      keyBefore: g.evals[g.turningPly - 1] ?? 0.2,
      keyAfter: g.evals[g.turningPly] ?? 0,
      keyClock: null,
      comeback: null,
    } satisfies Game,
  ]),
);

const TEAMS: Record<string, string> = {
  'United States of America': 'EUA', USA: 'EUA', Uzbekistan: 'Uzbequistão', Armenia: 'Armênia', India: 'Índia',
  Germany: 'Alemanha', Ukraine: 'Ucrânia', Netherlands: 'Holanda', Spain: 'Espanha', France: 'França', England: 'Inglaterra',
  Kazakhstan: 'Cazaquistão', Turkiye: 'Turquia', Türkiye: 'Turquia', Azerbaijan: 'Azerbaijão', Serbia: 'Sérvia', Poland: 'Polônia',
  Hungary: 'Hungria', Georgia: 'Geórgia', Norway: 'Noruega', Romania: 'Romênia', Mongolia: 'Mongólia', Vietnam: 'Vietnã',
  Italy: 'Itália', Czechia: 'Tchéquia', 'Czech Republic': 'Tchéquia', Greece: 'Grécia', Switzerland: 'Suíça', Sweden: 'Suécia',
  Denmark: 'Dinamarca', Croatia: 'Croácia', Slovenia: 'Eslovênia', Slovakia: 'Eslováquia', Brazil: 'Brasil', Mexico: 'México',
  Canada: 'Canadá', Egypt: 'Egito', Iran: 'Irã', Philippines: 'Filipinas', Indonesia: 'Indonésia', Bulgaria: 'Bulgária',
  Lithuania: 'Lituânia', Latvia: 'Letônia', Estonia: 'Estônia', Austria: 'Áustria', Belgium: 'Bélgica', Scotland: 'Escócia',
  Ireland: 'Irlanda', Colombia: 'Colômbia', Uruguay: 'Uruguai', Paraguay: 'Paraguai', Ecuador: 'Equador', Bolivia: 'Bolívia',
  'South Africa': 'África do Sul', Australia: 'Austrália', 'New Zealand': 'Nova Zelândia', Japan: 'Japão', Singapore: 'Singapura',
  Malaysia: 'Malásia', Moldova: 'Moldávia', Belarus: 'Belarus', Iceland: 'Islândia', Finland: 'Finlândia', Cuba: 'Cuba',
  Argentina: 'Argentina', Peru: 'Peru', Chile: 'Chile', China: 'China', Israel: 'Israel', Portugal: 'Portugal',
};

/** Seleção em português; "Uzbekistan 2" vira "Uzbequistão 2". */
export function ptTeam(t?: string) {
  if (!t) return t;
  const m = t.match(/^(.*?)(\s+\d+)?$/);
  const base = m?.[1] ?? t;
  return `${TEAMS[base] ?? base}${m?.[2] ?? ''}`;
}

// Palavras das seções do torneio ("Blitz Men", "Under 16 Girls"); o resto fica como veio
const SECTION: Record<string, string> = {
  open: 'aberto', women: 'feminino', "women's": 'feminino', girls: 'feminino', men: 'masculino', "men's": 'masculino',
  boys: 'masculino', blitz: 'blitz', rapid: 'rápido', classical: 'clássico', classic: 'clássico', seniors: 'sênior',
  senior: 'sênior', juniors: 'júnior', junior: 'júnior', amateurs: 'amador', amateur: 'amador', teams: 'por equipes',
  team: 'por equipes', individual: 'individual', finals: 'finais', final: 'final', playoffs: 'desempate',
  playoff: 'desempate', tiebreaks: 'desempate', tiebreak: 'desempate', and: 'e',
};

/** "Blitz Men" → "Blitz masculino"; "Under 16 Girls" → "Sub-16 feminino". */
export function ptSection(s: string) {
  const out = s
    .replace(/\b(?:Under|U)[\s-]?(\d{1,2})\b/gi, 'Sub-$1')
    .split(/\s+/)
    .map((w) => SECTION[w.toLowerCase()] ?? w)
    .join(' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** "46th FIDE Chess Olympiad Samarkand 2026 · Aberto" → "46ª Olimpíada de Xadrez (Samarcanda 2026) · Aberto" */
export function ptEvent(e: string) {
  // só a seção (depois do ·) é traduzida: "Atyrau Open 2026" é nome próprio e fica como está
  const [name, ...rest] = e.split(' · ');
  const pt = name.replace(/(\d+)(st|nd|rd|th) FIDE Chess Olympiad ([^·]+?) (\d{4})/i, (_, n, _s, city, year) => `${n}ª Olimpíada de Xadrez (${city.replace('Samarkand', 'Samarcanda')} ${year})`);
  return [pt, ...rest.map(ptSection)].join(' · ');
}

// Famílias de abertura com nome descritivo (os nomes de lichess.org/opening, em inglês).
// As que são nome de gente ("Pirc Defense") saem certas pela regra geral de ptPiece.
const OPENINGS: [string, string][] = [
  ['Sicilian Defense', 'Defesa Siciliana'], ['French Defense', 'Defesa Francesa'], ['Caro-Kann Defense', 'Defesa Caro-Kann'],
  ['Ruy Lopez', 'Abertura Espanhola'], ['Spanish Game', 'Abertura Espanhola'], ['Italian Game', 'Abertura Italiana'],
  ['Scotch Game', 'Abertura Escocesa'], ['Four Knights Game', 'Abertura dos Quatro Cavalos'], ['Three Knights Opening', 'Abertura dos Três Cavalos'],
  ['Two Knights Defense', 'Defesa dos Dois Cavalos'], ["Petrov's Defense", 'Defesa Petrov'], ['Russian Game', 'Defesa Petrov'],
  ['Vienna Game', 'Abertura Vienense'], ["King's Gambit Accepted", 'Gambito do Rei Aceito'], ["King's Gambit Declined", 'Gambito do Rei Recusado'],
  ["King's Gambit", 'Gambito do Rei'], ["Bishop's Opening", 'Abertura do Bispo'], ['Center Game', 'Abertura do Centro'],
  ['Danish Gambit', 'Gambito Dinamarquês'], ["King's Pawn Game", 'Abertura do Peão do Rei'], ["Queen's Pawn Game", 'Abertura do Peão da Dama'],
  ["Queen's Gambit Accepted", 'Gambito da Dama Aceito'], ["Queen's Gambit Declined", 'Gambito da Dama Recusado'], ["Queen's Gambit", 'Gambito da Dama'],
  ['Semi-Slav Defense', 'Defesa Semi-Eslava'], ['Slav Defense', 'Defesa Eslava'], ['Catalan Opening', 'Abertura Catalã'],
  ['Nimzo-Indian Defense', 'Defesa Nimzoíndia'], ["Queen's Indian Defense", 'Defesa Índia da Dama'], ['Bogo-Indian Defense', 'Defesa Bogoíndia'],
  ["King's Indian Defense", 'Defesa Índia do Rei'], ["King's Indian Attack", 'Ataque Índio do Rei'], ['Old Indian Defense', 'Defesa Índia Antiga'],
  ['Indian Defense', 'Defesa Índia'], ['Dutch Defense', 'Defesa Holandesa'], ['Budapest Defense', 'Defesa Budapeste'],
  ['English Opening', 'Abertura Inglesa'], ['English Defense', 'Defesa Inglesa'], ['Polish Opening', 'Abertura Polonesa'],
  ['Hungarian Opening', 'Abertura Húngara'], ['Modern Defense', 'Defesa Moderna'], ['Scandinavian Defense', 'Defesa Escandinava'],
  ['Kangaroo Defense', 'Defesa Canguru'], ['London System', 'Sistema Londres'], ['Elephant Gambit', 'Gambito do Elefante'],
  ['Latvian Gambit', 'Gambito Letão'], ['Albin Countergambit', 'Contragambito Albin'],
];

// Variantes: "Prins Variation" vira "Variante Prins". [substantivo, feminino?]
const KINDS: Record<string, [string, boolean]> = {
  Variation: ['Variante', true], Attack: ['Ataque', false], Gambit: ['Gambito', false], Defense: ['Defesa', true],
  System: ['Sistema', false], Line: ['Linha', true], Opening: ['Abertura', true], Countergambit: ['Contragambito', false],
  Formation: ['Formação', true],
};
// "Englund Gambit Declined" = "Gambito Englund Recusado"
const STATE: Record<string, [string, string]> = { Accepted: ['Aceito', 'Aceita'], Declined: ['Recusado', 'Recusada'] };
// adjetivos com masculino e feminino: "Classical Variation" = "Variante Clássica"
const ADJ: Record<string, [string, string]> = {
  Classical: ['Clássico', 'Clássica'], Modern: ['Moderno', 'Moderna'], Closed: ['Fechado', 'Fechada'], Open: ['Aberto', 'Aberta'],
  Accelerated: ['Acelerado', 'Acelerada'], Symmetrical: ['Simétrico', 'Simétrica'], Old: ['Antigo', 'Antiga'], Main: ['Principal', 'Principal'],
  Normal: ['Normal', 'Normal'], Quiet: ['Tranquilo', 'Tranquila'], Delayed: ['Adiado', 'Adiada'], Reversed: ['Invertido', 'Invertida'],
  English: ['Inglês', 'Inglesa'], Russian: ['Russo', 'Russa'], Dutch: ['Holandês', 'Holandesa'], Indian: ['Índio', 'Índia'],
};
// complementos: "Exchange Variation" = "Variante das Trocas"
const OF: Record<string, string> = {
  Exchange: 'das Trocas', Advance: 'do Avanço', Fianchetto: 'do Fianqueto', Retreat: 'da Retirada', Dragon: 'do Dragão',
  Hedgehog: 'do Ouriço', Wing: 'da Ala',
};
const PHRASES: [RegExp, string][] = [
  [/\bTwo Knights\b/, 'dos Dois Cavalos'], [/\bThree Knights\b/, 'dos Três Cavalos'], [/\bFour Knights\b/, 'dos Quatro Cavalos'],
  [/\bPoisoned Pawn\b/, 'do Peão Envenenado'],
];

// variantes com nome consagrado em português
const PIECES: Record<string, string> = {
  'Accelerated Dragon': 'Dragão Acelerado', 'Old Sicilian': 'Variante Antiga', 'Berlin Defense': 'Defesa Berlinense',
  'Venice Attack': 'Ataque Veneza',
};

function ptPiece(piece: string): string {
  const p = piece.trim();
  if (PIECES[p]) return PIECES[p];
  if (/^with /i.test(p)) return p.replace(/^with /i, 'com ');
  const words = p.split(' ');
  const state = STATE[words[words.length - 1]];
  const stateOf = KINDS[words[words.length - 2]];
  if (state && stateOf && words.length > 2) return `${ptPiece(words.slice(0, -1).join(' '))} ${state[stateOf[1] ? 1 : 0]}`;
  const kind = KINDS[words[words.length - 1]];
  if (!kind || words.length < 2) return p; // sem "Variation", "Attack"...: nome próprio, fica como veio
  const [noun, fem] = kind;
  let head = words.slice(0, -1).join(' ');
  for (const [re, pt] of PHRASES) head = head.replace(re, pt);
  const of: string[] = [];
  const names: string[] = [];
  const adjs: string[] = [];
  for (const w of head.split(' ')) {
    if (OF[w]) of.push(OF[w]);
    else if (ADJ[w]) adjs.push(ADJ[w][fem ? 1 : 0]);
    else names.push(w);
  }
  return [noun, ...of, ...names, ...adjs].join(' ');
}

/** "Sicilian Defense: Prins Variation, Venice Attack" → "Defesa Siciliana, Variante Prins, Ataque Venice". */
export function ptOpening(o?: string) {
  if (!o) return o;
  const [family, rest] = o.split(/:\s*/, 2);
  // a família maior primeiro: "Queen's Gambit Declined" antes de "Queen's Gambit"
  const hit = OPENINGS.filter(([en]) => family === en || family.startsWith(`${en} `)).sort((a, b) => b[0].length - a[0].length)[0];
  const extra = hit ? family.slice(hit[0].length).trim() : '';
  const head = hit ? `${hit[1]}${extra ? ` ${extra}` : ''}` : ptPiece(family);
  const pieces = rest ? rest.split(/,\s*/).map(ptPiece) : [];
  return [head, ...pieces].join(', ');
}

const localize = (g: Game): Game => ({
  ...g,
  event: ptEvent(g.event),
  opening: ptOpening(g.opening),
  whiteTeam: ptTeam(g.whiteTeam),
  blackTeam: ptTeam(g.blackTeam),
});

export function useGames(): Game[] {
  const { digest } = useStore();
  return useMemo(() => ((digest.games as Game[] | undefined) ?? []).map(localize), [digest]);
}

// Partidas de edições anteriores (scripts/archive.mjs), no mesmo lugar do arquivo.json:
// é dali que abrem os links compartilhados e o Arquivo depois que a partida sai do digest
const PARTIDAS_URL = ARQUIVO_URL.replace(/arquivo\.json$/, 'partidas.json');

const isGame = (g: unknown): g is Game => {
  const x = g as Game | null;
  return !!x && typeof x.key === 'string' && Array.isArray(x.moves) && Array.isArray(x.evals) && typeof x.keyPly === 'number';
};

// baixado uma vez por sessão e só quando falta uma partida; falha de rede libera nova tentativa
let archived: Promise<Record<string, unknown> | null> | null = null;
function loadArchived() {
  archived ??= fetch(PARTIDAS_URL, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : r.status === 404 ? {} : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: unknown) => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {}))
    .catch(() => {
      archived = null;
      return null;
    });
  return archived;
}

/**
 * Partida pela chave: digest de hoje, edição de exemplo e, se não estiver em nenhum, o partidas.json
 * das edições anteriores. `loading` evita mostrar "não encontrada" antes da resposta.
 */
export function useGameLookup(key?: string): { game: Game | undefined; loading: boolean; failed: boolean; retry: () => void } {
  const games = useGames();
  const local = useMemo(() => (key ? games.find((g) => g.key === key) ?? (LEGACY[key] ? localize(LEGACY[key]) : undefined) : undefined), [games, key]);
  const [found, setFound] = useState<{ key: string; game: Game | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const need = !!key && !local;
  useEffect(() => {
    if (!need || !key) return;
    let alive = true;
    loadArchived().then((map) => {
      if (!alive) return;
      const g = map?.[key];
      setFound({ key, game: isGame(g) ? localize(g) : null, failed: map == null });
    });
    return () => {
      alive = false;
    };
  }, [need, key, attempt]);
  const retry = useCallback(() => {
    setFound(null);
    setAttempt((a) => a + 1);
  }, []);
  if (local || !key) return { game: local, loading: false, failed: false, retry };
  const mine = found?.key === key ? found : null;
  return { game: mine?.game ?? undefined, loading: !mine, failed: !!mine?.failed, retry };
}

export function useGame(key?: string): Game | undefined {
  return useGameLookup(key).game;
}

/** Link da partida no próprio site (o 404.html do site é o app, que abre a rota). */
export const gameLink = (key: string) => `${SITE_URL}/game/${encodeURIComponent(key)}`;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Dia da rodada: "hoje", "ontem" ou "14 out", no fuso do aparelho. Sem startsAt, null. */
export function gameDay(g: Game, now = new Date()): string | null {
  if (!g.startsAt) return null;
  const d = new Date(g.startsAt);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // arredonda: dia com troca de horário de verão tem 23 ou 25 h
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const RECENT_AFTER = 36 * 3600 * 1000;

/**
 * Título da seção no Hoje. Vale o que o robô gravou em gamesInfo; sem isso (digest antigo) ou com a
 * busca falhando (stale), decide pela idade: todas as partidas com mais de 36 h = "recentes".
 */
export function useGamesHeading(games: Game[]): string {
  const { digest } = useStore();
  // hora de referência fixada ao abrir a tela: o título não muda sozinho no meio da leitura
  const [now] = useState(Date.now);
  const info = (digest as unknown as { gamesInfo?: Partial<GamesInfo> }).gamesInfo;
  if (info?.mode === 'recentes') return 'Partidas recentes';
  if (info?.mode === 'dia' && !info.stale) return 'Partidas do dia';
  const old = games.length > 0 && games.every((g) => g.startsAt != null && now - g.startsAt > RECENT_AFTER);
  return old ? 'Partidas recentes' : 'Partidas do dia';
}

// Notação com figuras (♘f3, ♖xb3): universal, não depende do idioma.
// U+FE0E pede a versão de texto do símbolo, para nenhum aparelho trocar por emoji.
const FIG: Record<string, string> = { K: '♔︎', Q: '♕︎', R: '♖︎', B: '♗︎', N: '♘︎' };
export const fig = (san: string) => san.replace(/[KQRBN]/g, (m) => FIG[m]);

/** "40… ♖xb3" para o lance de índice `ply` (0 = primeiro lance das brancas). */
export function moveLabel(g: Game, ply: number) {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${fig(g.moves[ply])}`;
}

export function fmtEval(e: number | undefined | null) {
  if (e == null) return '0,0';
  if (Math.abs(e) >= 20) return e > 0 ? '+M' : '−M';
  return (e > 0 ? '+' : e < 0 ? '−' : '') + Math.abs(e).toFixed(1).replace('.', ',');
}

export function fmtClock(sec: number) {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export function winnerName(g: Game) {
  return g.result === '1-0' ? g.whiteSurname : g.result === '0-1' ? g.blackSurname : null;
}

/** Sobrenome de quem joga o lance de índice `ply`. */
const moverOf = (g: Game, ply: number) => (ply % 2 === 0 ? g.whiteSurname : g.blackSurname);

/** Lance sem xeque, mate e anotação, para comparar o que veio de fontes diferentes. */
export const cleanSan = (san: string) => san.replace(/[+#!?]/g, '');

/** Sequência a partir do lance de índice `ply`, no mesmo formato de moveLabel: "32… ♕xh6 33. ♔b1 ♕h1+". */
export function fmtLine(ply: number, sans: string[]) {
  return sans
    .map((s, i) => {
      const p = ply + i;
      const n = Math.floor(p / 2) + 1;
      return `${p % 2 === 0 ? `${n}. ` : i === 0 ? `${n}… ` : ''}${fig(s)}`;
    })
    .join(' ');
}

// chance de vitória de −1 a +1 (fórmula do Lichess), pelo lado das brancas; o teto de 10 peões cobre o mate
const chance = (e: number) => 2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, e * 100)))) - 1;

export type Severity = 'imprecisão' | 'erro' | 'erro grave';
const GLYPH: Record<Severity, string> = { imprecisão: '?!', erro: '?', 'erro grave': '??' };

/**
 * Tamanho do lance-chave pela queda na chance de vitória de quem jogou, com os limites do Lichess
 * (0,1 / 0,2 / 0,3). Em peões puros, +8 → +5 pareceria grave e 0,0 → −1,5 pareceria pouco.
 */
export function keySeverity(g: Game): Severity | null {
  const pov = g.keyPly % 2 === 0 ? 1 : -1;
  const drop = (chance(g.keyBefore) - chance(g.keyAfter)) * pov;
  return drop >= 0.3 ? 'erro grave' : drop >= 0.2 ? 'erro' : drop >= 0.1 ? 'imprecisão' : null;
}

/** Lance-chave com a anotação de xadrez: "32. ♔a1??". */
function keyLabel(g: Game) {
  const s = keySeverity(g);
  return `${moveLabel(g, g.keyPly)}${s ? GLYPH[s] : ''}`;
}

/** Rótulo curto do momento-chave. No Anti-Spoiler é neutro: "erro decisivo" já diz quem perdeu. */
export function keyTitle(g: Game, hideResult = false) {
  if (hideResult) return 'Momento-chave';
  if (g.comeback) return 'Virada';
  if (g.keyKind === 'chance') return 'Vantagem perdida';
  // uma imprecisão não é "erro decisivo": a partida foi decidida aos poucos
  const s = keySeverity(g);
  return s === 'erro' || s === 'erro grave' ? 'Erro decisivo' : 'Momento-chave';
}

// posição antes do lance de índice `ply`, para conferir as linhas do motor no tabuleiro
function fenAt(g: Game, ply: number): string | null {
  const ch = new Chess();
  try {
    for (let i = 0; i < ply; i++) ch.move(g.moves[i]);
  } catch {
    return null;
  }
  return ch.fen();
}

// a parte da linha que é legal a partir da posição, já no SAN do chess.js (com + e #)
function legalPrefix(fen: string, sans: unknown[]): string[] {
  const ch = new Chess(fen);
  const out: string[] = [];
  for (const s of sans) {
    if (typeof s !== 'string') break;
    try {
      out.push(ch.move(s).san);
    } catch {
      break;
    }
  }
  return out;
}

/** Linha do melhor lance na posição antes do erro, começando pelo próprio lance; [] se não houver. */
export function bestLine(g: Game): string[] {
  const b = g.keyBest;
  if (!b || typeof b.san !== 'string') return [];
  const fen = fenAt(g, g.keyPly);
  if (!fen) return [];
  const line: unknown[] = Array.isArray(b.line) ? b.line : [];
  // a linha pode vir com ou sem o próprio lance na frente: fica a leitura que o tabuleiro aceita por mais tempo
  const withBest = legalPrefix(fen, [b.san, ...line]);
  const asIs = typeof line[0] === 'string' && cleanSan(line[0]) === cleanSan(b.san) ? legalPrefix(fen, line) : [];
  const out = asIs.length > withBest.length ? asIs : withBest;
  return out.length && cleanSan(out[0]) === cleanSan(b.san) ? out : [];
}

/** Refutação do motor na posição depois do erro; o 1º lance é a resposta do desafio. */
export function refuteLine(g: Game): string[] {
  if (!Array.isArray(g.keyRefute) || !g.keyRefute.length) return [];
  const fen = fenAt(g, g.keyPly + 1);
  return fen ? legalPrefix(fen, g.keyRefute) : [];
}

/**
 * Legenda do momento-chave, só com dados da partida (lance, relógio, avaliação).
 * Com `hideResult` (Anti-Spoiler), fica só o lance e o relógio: a variação da avaliação
 * diz quem ficou ganhando tanto quanto o resultado.
 */
export function keyCaption(g: Game, hideResult = false) {
  const mover = moverOf(g, g.keyPly);
  if (hideResult) return `${mover} jogou ${moveLabel(g, g.keyPly)}${g.keyClock != null ? `, com ${fmtClock(g.keyClock)} no relógio` : ''}.`;
  const clock = g.keyClock != null ? `, com ${fmtClock(g.keyClock)} no relógio,` : '';
  const swing = `a avaliação foi de ${fmtEval(g.keyBefore)} para ${fmtEval(g.keyAfter)}`;
  const text = `${mover} jogou ${keyLabel(g)}${clock} e ${swing}.`;
  if (g.keyKind === 'chance') return `${text} A partida terminou empatada.`;
  if (g.comeback) return `${text} Antes disso, ${winnerName(g)} chegou a estar ${Math.abs(g.comeback).toFixed(1).replace('.', ',')} peões atrás.`;
  return text;
}

export function resultLabel(g: Game) {
  return g.result === '1/2-1/2' ? '½–½' : g.result.replace('-', '–');
}

const sideName = (whiteToMove: boolean) => (whiteToMove ? 'brancas' : 'pretas');

/**
 * Desafio: na posição logo depois do erro decisivo, achar o lance com que o vencedor puniu.
 * Só vale se esse lance manteve a vantagem (o motor confirma); empates não têm desafio.
 */
export function puzzlePly(g: Game): number | null {
  if (g.result === '1/2-1/2' || g.keyKind !== 'erro') return null;
  const reply = g.keyPly + 1;
  if (reply >= g.moves.length) return null;
  const pov = g.result === '1-0' ? 1 : -1;
  const afterError = (g.evals[g.keyPly] ?? 0) * pov;
  const afterReply = (g.evals[reply] ?? 0) * pov;
  return afterError >= 1 && afterReply >= afterError - 1 ? reply : null;
}

/**
 * Lances que o desafio aceita além do da partida: os que o motor também dá como ganhadores
 * (keyAlts) e o melhor dele. Sem keyAlts (análise antiga), só o da partida, como antes.
 */
export function puzzleAlts(g: Game): string[] {
  if (!Array.isArray(g.keyAlts)) return [];
  const played = cleanSan(g.moves[g.keyPly + 1] ?? '');
  const all = [...g.keyAlts, ...(Array.isArray(g.keyRefute) ? g.keyRefute.slice(0, 1) : [])]
    .filter((s): s is string => typeof s === 'string')
    .map(cleanSan);
  return [...new Set(all)].filter((s) => s && s !== played);
}

export type Ending = { mate: boolean; stalemate: boolean; repetition: boolean; insufficient: boolean };

function describe(e: number) {
  const a = Math.abs(e);
  const who = e > 0 ? 'as brancas' : 'as pretas';
  if (a < 0.7) return 'equilibrada';
  if (a < 1.8) return `com leve vantagem para ${who}`;
  if (a < 4) return `com vantagem clara para ${who}`;
  return `praticamente ganha para ${who}`;
}

const PHASE_IN: Record<string, string> = { abertura: 'ainda na abertura, ', 'meio-jogo': 'no meio-jogo, ', final: 'já no final, ' };
const TC_TXT: Record<string, string> = { blitz: ' Foi uma partida de blitz.', rapid: ' Foi uma partida de xadrez rápido.' };
// "apuro de tempo" depende do ritmo: 3 min é muito numa blitz e pouco numa clássica
const HURRY: Record<string, number> = { standard: 180, rapid: 60, blitz: 20 };

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
// o robô grava mate como ±20 (fmtEval mostra "+M")
const MATE_EVAL = 20;

/** " A partida começou com a Defesa Siciliana." O artigo segue a 1ª palavra; nome que ficou em inglês vai sem. */
function openingTxt(o?: string) {
  if (!o) return '';
  const first = o.split(/[\s,]/)[0];
  if (/^(Defesa|Abertura|Variante|Linha)$/.test(first)) return ` A partida começou com a ${o}.`;
  if (/^(Gambito|Ataque|Sistema|Contragambito)$/.test(first)) return ` A partida começou com o ${o}.`;
  return ` A abertura foi ${o}.`;
}

/** Uma virada além do lance decisivo: quem jogou, o lance e a variação. Null se não for queda de quem jogou. */
function swingText(g: Game, s: { ply: number; before: number; after: number }) {
  const pov = s.ply % 2 === 0 ? 1 : -1;
  const had = s.before * pov;
  const kept = s.after * pov;
  if (kept >= had) return null;
  const who = moverOf(g, s.ply);
  const what = `${moveLabel(g, s.ply)} (${fmtEval(s.before)} → ${fmtEval(s.after)})`;
  if (had >= 1) return kept > 0.7 ? `${who} devolveu parte da vantagem em ${what}` : `${who} deixou escapar a vantagem em ${what}`;
  return `${who} errou em ${what}`;
}

/**
 * Relato da partida em parágrafos, montado só com o PGN e a análise do nosso Stockfish (sem IA).
 * Usa os campos da análise nova quando existem (fase, melhor lance, refutação, mate, outras viradas,
 * precisão, ritmo) e cai no texto simples quando não. A resposta do desafio nunca aparece aqui:
 * o relato fica acima do tabuleiro.
 */
export function gameStory(g: Game, end: Ending): string[] {
  const team = (t?: string, elo?: number) => [t, elo || null].filter(Boolean).join(', ');
  const wInfo = team(g.whiteTeam, g.whiteElo);
  const bInfo = team(g.blackTeam, g.blackElo);
  const total = Math.ceil(g.moves.length / 2);
  const out: string[] = [];

  // "46ª Olimpíada de Xadrez (Samarcanda 2026) · Aberto" → "da 46ª Olimpíada ..., no torneio aberto"
  const [eventName, section] = g.event.split(' · ');
  const fem = /^(\d+ª )?(Olimpíada|Copa|Liga|Taça|Superliga|Final)/i.test(eventName ?? '') || /\b(League|Liga|Bundesliga|Cup|Olympiad)\b/i.test(eventName ?? '');
  const sectionTxt = section ? `, no torneio ${section.toLowerCase()}` : '';
  const where = [g.round ? `na ${g.round.toLowerCase()}` : '', eventName ? `${fem ? 'da' : 'do'} ${eventName}${sectionTxt}` : ''].filter(Boolean).join(' ');
  out.push(
    `${g.white}${wInfo ? ` (${wInfo})` : ''} jogou de brancas contra ${g.black}${bInfo ? ` (${bInfo})` : ''}${where ? ` ${where}` : ''}.${TC_TXT[g.tc ?? ''] ?? ''}${openingTxt(g.opening)}`,
  );

  const early = Math.min(29, g.keyPly - 1);
  if (early >= 9) {
    out.push(`Depois de ${Math.floor(early / 2) + 1} lances, o motor via a posição ${describe(g.evals[early])} (${fmtEval(g.evals[early])}).`);
  }

  const mover = moverOf(g, g.keyPly);
  const replier = moverOf(g, g.keyPly + 1);
  const clock = g.keyClock != null ? `, com ${fmtClock(g.keyClock)} no relógio,` : '';
  const hurry = g.keyClock != null && g.keyClock < (HURRY[g.tc ?? 'standard'] ?? 180) ? ' Foi em apuro de tempo.' : '';
  const winner = winnerName(g);
  const puzzle = puzzlePly(g);
  const sev = keySeverity(g);
  const phase = PHASE_IN[g.phase ?? ''] ?? '';
  const swing = `${fmtEval(g.keyBefore)} para ${fmtEval(g.keyAfter)}`;

  if (g.comeback && winner) {
    out.push(`${winner} chegou a estar ${Math.abs(g.comeback).toFixed(1).replace('.', ',')} peões atrás na avaliação, mas seguiu jogando.`);
  }

  // o lance-chave, com o tamanho do erro e o que o motor preferia
  const key: string[] = [];
  if (g.keyKind === 'chance') {
    key.push(`O momento-chave veio ${phase}no lance ${keyLabel(g)}: ${mover}${clock} tinha ${fmtEval(g.keyBefore)} e, depois desse lance, a avaliação caiu para ${fmtEval(g.keyAfter)}.${hurry}`);
  } else if (sev === 'erro' || sev === 'erro grave') {
    key.push(`O erro decisivo veio ${phase}em ${keyLabel(g)}, ${sev === 'erro grave' ? 'um erro grave' : 'um erro'}: ${mover}${clock} levou a avaliação de ${swing}.${hurry}`);
  } else if (sev === 'imprecisão') {
    key.push(`O momento-chave veio ${phase}em ${keyLabel(g)}, uma imprecisão: ${mover}${clock} levou a avaliação de ${swing}.${hurry}`);
  } else {
    key.push(`O momento-chave veio ${phase}em ${moveLabel(g, g.keyPly)}: ${mover}${clock} jogou esse lance e a avaliação foi de ${swing}.${hurry}`);
  }
  if (g.keyKind === 'erro' && winner && isNum(g.keyMateIn) && Math.abs(g.keyMateIn) >= 1) {
    key.push(`Depois desse lance, as ${sideName((g.keyPly + 1) % 2 === 0)} tinham mate em ${Math.abs(Math.round(g.keyMateIn))}.`);
  }
  // com desafio, a continuação da linha pode trazer o lance que pune (a resposta): fica só o melhor lance
  const best = puzzle != null ? bestLine(g).slice(0, 1) : bestLine(g);
  if (best.length && cleanSan(best[0]) !== cleanSan(g.moves[g.keyPly])) {
    const bestEval = g.keyBest?.eval;
    const ev = isNum(bestEval) ? ` (${fmtEval(bestEval)})` : '';
    key.push(`O motor preferia ${fmtLine(g.keyPly, best.slice(0, 1))}${ev}${best.length > 1 ? `, seguido de ${fmtLine(g.keyPly + 1, best.slice(1))}` : ''}.`);
  }
  out.push(key.join(' '));

  // a refutação entrega o desafio: com desafio, ela só aparece no tabuleiro depois de resolvido
  const refute = puzzle == null ? refuteLine(g) : [];
  if (refute.length) {
    const played = g.moves[g.keyPly + 1];
    const tail = played == null ? '' : cleanSan(refute[0]) === cleanSan(played) ? ` Foi o que ${replier} jogou.` : ` Na partida, ${replier} jogou ${moveLabel(g, g.keyPly + 1)}.`;
    const lead = g.keyKind === 'erro' ? 'O motor mostra como punir' : 'A melhor resposta, para o motor, era';
    out.push(`${lead}: ${fmtLine(g.keyPly + 1, refute)}.${tail}`);
  }
  if (puzzle != null && winner) out.push(`${winner} achou na hora o lance que punia o erro. Consegue achar também? Tente no desafio abaixo.`);

  // outras viradas: quando o vencedor devolveu a vantagem, a vitória não foi em linha reta
  const swings = (Array.isArray(g.swings) ? g.swings : [])
    .filter((s) => s && Number.isInteger(s.ply) && s.ply >= 0 && s.ply < g.moves.length && isNum(s.before) && isNum(s.after))
    .filter((s) => s.ply !== g.keyPly && s.ply !== puzzle)
    .sort((a, b) => a.ply - b.ply)
    .slice(0, 3)
    .map((s) => ({ text: swingText(g, s), byWinner: !!winner && moverOf(g, s.ply) === winner }))
    .filter((s): s is { text: string; byWinner: boolean } => !!s.text);
  if (swings.length) {
    const lead = swings.some((s) => s.byWinner) ? 'A vitória não veio em linha reta' : 'A partida teve outras viradas';
    out.push(`${lead}: ${swings.map((s) => s.text).join('; ')}.`);
  }

  const left = total - (Math.floor(g.keyPly / 2) + 1);
  const more = left > 0 ? `${left === 1 ? 'Foi mais 1 lance' : `Foram mais ${left} lances`} até o fim: ` : '';
  if (g.result === '1/2-1/2') {
    const how = end.stalemate ? 'por afogamento' : end.repetition ? 'por repetição de lances' : end.insufficient ? 'por falta de material' : 'em comum acordo';
    out.push(`A partida terminou empatada ${how}, no lance ${total}.`);
  } else if (winner) {
    // o PGN só traz o resultado: sem mate, a avaliação final diz o que dá para afirmar
    const loser = winner === g.whiteSurname ? g.blackSurname : g.whiteSurname;
    const lastEval = g.evals[g.evals.length - 1] ?? 0;
    const forWinner = lastEval * (g.result === '1-0' ? 1 : -1);
    const how = end.mate
      ? `com xeque-mate no lance ${total}`
      : forWinner >= MATE_EVAL
        ? `no lance ${total}, com mate forçado à vista no tabuleiro`
        : forWinner >= 3
        ? `no lance ${total}, com ${loser} em posição perdida no tabuleiro (${fmtEval(lastEval)})`
        : forWinner >= 0.7
          ? `no lance ${total}, com vantagem clara no tabuleiro (${fmtEval(lastEval)}), ainda sem mate`
          : `no lance ${total}, com a posição ainda em aberto no tabuleiro (${fmtEval(lastEval)}), o que costuma indicar derrota no tempo`;
    out.push(`${more}${winner} venceu ${how}.`);
  }

  const acc = g.accuracy;
  if (acc && isNum(acc.white) && isNum(acc.black)) {
    out.push(`Precisão calculada pelo Stockfish: ${g.whiteSurname} ${Math.round(acc.white)}%, ${g.blackSurname} ${Math.round(acc.black)}%.`);
  }
  return out;
}

export { sideName };
