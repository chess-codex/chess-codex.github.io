// Stockfish 19 (WASM, pacote npm "stockfish") rodando no Node, conversando por UCI.
// O robô reavalia as partidas com ele: a avaliação que vem nas transmissões é rasa e
// atrasada (ex.: marcou o erro de Hovhannisyan dois lances depois do lance real).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { Chess } from 'chess.js';

const MATE = 20;

export async function createEngine({ depth = 14 } = {}) {
  const bin = createRequire(import.meta.url).resolve('stockfish/bin/stockfish.js');
  const proc = spawn(process.execPath, [bin], { stdio: ['pipe', 'pipe', 'ignore'] });
  const listeners = new Set();
  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      for (const l of [...listeners]) l(line);
    }
  });
  const send = (cmd) => proc.stdin.write(`${cmd}\n`);
  const waitFor = (pred, ms = 60000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        listeners.delete(fn);
        reject(new Error('Stockfish não respondeu'));
      }, ms);
      const fn = (line) => {
        if (!pred(line)) return;
        clearTimeout(t);
        listeners.delete(fn);
        resolve(line);
      };
      listeners.add(fn);
    });

  send('uci');
  await waitFor((l) => l === 'uciok');
  send('setoption name Threads value 2');
  send('setoption name Hash value 64');
  send('isready');
  await waitFor((l) => l === 'readyok');

  /** Avaliação em peões do ponto de vista das brancas (mate = ±20). */
  async function evaluate(fen) {
    const pos = new Chess(fen);
    if (pos.isCheckmate()) return pos.turn() === 'w' ? -MATE : MATE;
    if (pos.isStalemate() || pos.isInsufficientMaterial()) return 0;
    let score = null;
    const collect = (line) => {
      const m = line.match(/^info .*? score (cp|mate) (-?\d+)/);
      if (m && !/ multipv [2-9]/.test(line)) score = m[1] === 'mate' ? (Number(m[2]) > 0 ? MATE : -MATE) : Number(m[2]) / 100;
    };
    listeners.add(collect);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
    await waitFor((l) => l.startsWith('bestmove'));
    listeners.delete(collect);
    if (score == null) return null;
    const pov = pos.turn() === 'w' ? score : -score;
    return Math.max(-MATE, Math.min(MATE, pov));
  }

  return {
    evaluate,
    quit() {
      send('quit');
      setTimeout(() => proc.kill(), 500);
    },
  };
}
