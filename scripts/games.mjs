// Extrai partidas-chave de um PGN de broadcast do Lichess (API pública e grátis)
// e gera src/data/games.json com lances, avaliação por lance e o "lance da virada".
// Uso: node scripts/games.mjs scripts/r9.pgn "Gukesh" "Sindarov" "Abdusattorov"
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const [file, ...who] = process.argv.slice(2);
const chunks = readFileSync(file, 'utf8').split(/\n\n(?=\[Event )/);
const out = {};
for (const raw of chunks) {
  if (!who.some((w) => raw.includes(w))) continue;
  const tag = (k) => raw.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? '';
  const evals = [...raw.matchAll(/\[%eval ([^\]\s]+)/g)].map((m) => (m[1].startsWith('#') ? (m[1].includes('-') ? -99 : 99) : Number(m[1])));
  const g = new Chess();
  g.loadPgn(raw.replace(/\{[^}]*\}/g, ''));
  const moves = g.history();
  // maior oscilação de avaliação (em peões) = momento da virada
  let turn = 0, best = 0;
  for (let i = 1; i < evals.length; i++) {
    const a = Math.max(-10, Math.min(10, evals[i - 1])), b = Math.max(-10, Math.min(10, evals[i]));
    if (Math.abs(b - a) > best) { best = Math.abs(b - a); turn = i; }
  }
  const key = `${tag('White').split(',')[0]}-${tag('Black').split(',')[0]}`.toLowerCase().replace(/[^a-z-]/g, '');
  out[key] = {
    white: tag('White'), black: tag('Black'), whiteElo: tag('WhiteElo'), blackElo: tag('BlackElo'),
    whiteTeam: tag('WhiteTeam'), blackTeam: tag('BlackTeam'), result: tag('Result'),
    opening: tag('Opening'), url: tag('GameURL'), moves, evals: evals.slice(0, moves.length), turningPly: turn,
  };
  console.log(key, moves.length, 'lances; virada no ply', turn, 'swing', best.toFixed(1), 'eval antes/depois', evals[turn - 1], evals[turn]);
}
writeFileSync(new URL('../src/data/games.json', import.meta.url), JSON.stringify(out));
