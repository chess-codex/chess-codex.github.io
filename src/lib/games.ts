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

export function useGames(): Game[] {
  const { digest } = useStore();
  return (digest.games as Game[] | undefined) ?? [];
}

export function useGame(key?: string): Game | undefined {
  const games = useGames();
  return useMemo(() => (key ? games.find((g) => g.key === key) ?? LEGACY[key] : undefined), [games, key]);
}

// SAN inglês → notação em português (R rei, D dama, T torre, B bispo, C cavalo)
const PT: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'B', N: 'C' };
export const pt = (san: string) => san.replace(/[KQRBN]/g, (m) => PT[m]);

/** "40… Txb3" para o lance de índice `ply` (0 = primeiro lance das brancas). */
export function moveLabel(g: Game, ply: number) {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${pt(g.moves[ply])}`;
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
