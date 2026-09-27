import bundled from './players.json';

// Top 10 FIDE (aberto) + top 5 feminino, lidos de ratings.fide.com pelo robô.
// Este arquivo é a cópia embutida; a lista viva vem no digest.
export type Player = {
  id: string; name: string; aliases: string[];
  rank: number; country: string; rating: number; list: 'open' | 'women';
};

export const BUNDLED_PLAYERS = bundled.players as Player[];

export function mentions(text: string, players: Player[]): Player[] {
  return players.filter((p) => p.aliases.some((a) => new RegExp(`\\b${a}\\b`, 'i').test(text)));
}
