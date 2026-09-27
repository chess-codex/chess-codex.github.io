import { useMemo } from 'react';

import legacy from '@/data/games.json';
import { useStore } from './store';

// Partida com a posição decisiva já calculada pelo robô (scripts/games.mjs).
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
};

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

/** "46th FIDE Chess Olympiad Samarkand 2026 · Aberto" → "46ª Olimpíada de Xadrez (Samarcanda 2026) · Aberto" */
export function ptEvent(e: string) {
  return e
    .replace(/(\d+)(st|nd|rd|th) FIDE Chess Olympiad ([^·]+?) (\d{4})/i, (_, n, _s, city, year) => `${n}ª Olimpíada de Xadrez (${city.replace('Samarkand', 'Samarcanda')} ${year})`)
    .replace(/\bWomen\b/, 'Feminino')
    .replace(/\bOpen\b/, 'Aberto');
}

const localize = (g: Game): Game => ({ ...g, event: ptEvent(g.event), whiteTeam: ptTeam(g.whiteTeam), blackTeam: ptTeam(g.blackTeam) });

export function useGames(): Game[] {
  const { digest } = useStore();
  return useMemo(() => ((digest.games as Game[] | undefined) ?? []).map(localize), [digest]);
}

export function useGame(key?: string): Game | undefined {
  const games = useGames();
  return useMemo(() => (key ? games.find((g) => g.key === key) ?? (LEGACY[key] ? localize(LEGACY[key]) : undefined) : undefined), [games, key]);
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

/** Rótulo curto do momento-chave. */
export function keyTitle(g: Game) {
  if (g.comeback) return 'Virada';
  return g.keyKind === 'chance' ? 'Vantagem perdida' : 'Erro decisivo';
}

/** Legenda do momento-chave, só com dados da partida (lance, relógio, avaliação). */
export function keyCaption(g: Game) {
  const mover = g.keyPly % 2 === 0 ? g.whiteSurname : g.blackSurname;
  const clock = g.keyClock != null ? `, com ${fmtClock(g.keyClock)} no relógio,` : '';
  const swing = `a avaliação foi de ${fmtEval(g.keyBefore)} para ${fmtEval(g.keyAfter)}`;
  if (g.keyKind === 'chance') return `${mover} jogou ${moveLabel(g, g.keyPly)}${clock} e ${swing}. A partida terminou empatada.`;
  let text = `${mover} jogou ${moveLabel(g, g.keyPly)}${clock} e ${swing}.`;
  if (g.comeback) text += ` Antes disso, ${winnerName(g)} chegou a estar ${Math.abs(g.comeback).toFixed(1).replace('.', ',')} peões atrás.`;
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

export type Ending = { mate: boolean; stalemate: boolean; repetition: boolean; insufficient: boolean };

function describe(e: number) {
  const a = Math.abs(e);
  const who = e > 0 ? 'as brancas' : 'as pretas';
  if (a < 0.7) return 'equilibrada';
  if (a < 1.8) return `com leve vantagem para ${who}`;
  if (a < 4) return `com vantagem clara para ${who}`;
  return `praticamente ganha para ${who}`;
}

/** Relato da partida em parágrafos, montado só com o PGN e a avaliação do motor. */
export function gameStory(g: Game, end: Ending): string[] {
  const team = (t?: string, elo?: number) => [t, elo || null].filter(Boolean).join(', ');
  const wInfo = team(g.whiteTeam, g.whiteElo);
  const bInfo = team(g.blackTeam, g.blackElo);
  const total = Math.ceil(g.moves.length / 2);
  const out: string[] = [];

  // "46ª Olimpíada de Xadrez (Samarcanda 2026) · Aberto" → "da 46ª Olimpíada ..., no torneio aberto"
  const [eventName, section] = g.event.split(' · ');
  const article = /^(\d+ª )?(Olimpíada|Copa|Liga|Taça|Superliga|Final)/i.test(eventName ?? '') ? 'da' : 'do';
  const sectionTxt = section ? `, no torneio ${section.toLowerCase()}` : '';
  const where = [g.round ? `na ${g.round.toLowerCase()}` : '', eventName ? `${article} ${eventName}${sectionTxt}` : ''].filter(Boolean).join(' ');
  out.push(
    `${g.white}${wInfo ? ` (${wInfo})` : ''} jogou de brancas contra ${g.black}${bInfo ? ` (${bInfo})` : ''}${where ? ` ${where}` : ''}.${g.opening ? ` A abertura foi ${g.opening}.` : ''}`,
  );

  const early = Math.min(29, g.keyPly - 1);
  if (early >= 9) {
    out.push(`Depois de ${Math.floor(early / 2) + 1} lances, o motor via a posição ${describe(g.evals[early])} (${fmtEval(g.evals[early])}).`);
  }

  const mover = g.keyPly % 2 === 0 ? g.whiteSurname : g.blackSurname;
  const clock = g.keyClock != null ? `, com ${fmtClock(g.keyClock)} no relógio,` : '';
  const hurry = g.keyClock != null && g.keyClock < 180 ? ' Foi um erro em apuro de tempo.' : '';
  const winner = winnerName(g);

  if (g.comeback && winner) {
    out.push(`${winner} chegou a estar ${Math.abs(g.comeback).toFixed(1).replace('.', ',')} peões atrás na avaliação, mas seguiu jogando.`);
  }
  if (g.keyKind === 'chance') {
    out.push(`O momento-chave veio no lance ${moveLabel(g, g.keyPly)}: ${mover}${clock} tinha ${fmtEval(g.keyBefore)} e, depois desse lance, a avaliação caiu para ${fmtEval(g.keyAfter)}.${hurry}`);
  } else {
    out.push(`O erro decisivo veio em ${moveLabel(g, g.keyPly)}: ${mover}${clock} jogou esse lance e a avaliação foi de ${fmtEval(g.keyBefore)} para ${fmtEval(g.keyAfter)}.${hurry}`);
    // o lance da resposta fica escondido: é a resposta do desafio no tabuleiro
    if (puzzlePly(g) != null && winner) out.push(`${winner} achou na hora o lance que punia o erro. Consegue achar também? Tente no desafio abaixo.`);
  }

  const left = total - (Math.floor(g.keyPly / 2) + 1);
  if (g.result === '1/2-1/2') {
    const how = end.stalemate ? 'por afogamento' : end.repetition ? 'por repetição de lances' : end.insufficient ? 'por falta de material' : 'em comum acordo';
    out.push(`A partida terminou empatada ${how}, no lance ${total}.`);
  } else if (winner) {
    const how = end.mate ? `com xeque-mate no lance ${total}` : `no lance ${total}, quando ${winner === g.whiteSurname ? g.blackSurname : g.whiteSurname} desistiu ou perdeu no tempo`;
    out.push(`${left > 0 ? `Foram mais ${left} lances até o fim: ` : ''}${winner} venceu ${how}.`);
  }
  return out;
}

export { sideName };
