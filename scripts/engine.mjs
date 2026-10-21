// Stockfish 19 (WASM, pacote npm "stockfish") rodando no Node, conversando por UCI.
// O robô reavalia as partidas com ele: a avaliação que vem nas transmissões é rasa e
// atrasada (ex.: marcou o erro de Hovhannisyan dois lances depois do lance real).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { Chess } from 'chess.js';

const MATE = 20;

/** Lances UCI do motor ("e2e4", "e7e8q") em SAN, parando no primeiro que não for legal. */
function toSan(fen, uci) {
  const c = new Chess(fen);
  const out = [];
  for (const u of uci) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

export async function createEngine({ depth = 14 } = {}) {
  const bin = createRequire(import.meta.url).resolve('stockfish/bin/stockfish.js');
  const listeners = new Set();
  let proc = null;
  let alive = false;
  let closed = false;
  const send = (cmd) => proc?.stdin.write(`${cmd}\n`);
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
      // motor caiu: quem espera recebe o erro na hora, em vez de esperar o prazo inteiro
      fn.fail = (e) => {
        clearTimeout(t);
        listeners.delete(fn);
        reject(e);
      };
      listeners.add(fn);
    });

  // O WASM com threads às vezes cai logo ao abrir (no Windows, com o código 0xC0000409) ou no meio
  // da análise. O motor é reaberto (até 3 tentativas) e a busca seguinte continua nele.
  async function start() {
    for (let attempt = 1; ; attempt++) {
      const p = spawn(process.execPath, [bin], { stdio: ['pipe', 'pipe', 'ignore'] });
      proc = p;
      alive = true;
      let buf = '';
      p.stdin.on('error', () => {}); // escrever num motor que caiu não pode derrubar o robô
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (d) => {
        if (p !== proc) return;
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          for (const l of [...listeners]) l(line);
        }
      });
      p.on('exit', () => {
        if (p !== proc) return;
        alive = false;
        for (const l of [...listeners]) l.fail?.(new Error('Stockfish caiu'));
      });
      try {
        send('uci');
        await waitFor((l) => l === 'uciok', 20000);
        send('setoption name Threads value 2');
        send('setoption name Hash value 64');
        send('isready');
        await waitFor((l) => l === 'readyok', 20000);
        return;
      } catch (e) {
        alive = false;
        p.kill();
        if (attempt >= 3) throw e;
      }
    }
  }
  const ready = async () => {
    if (closed) throw new Error('Stockfish já foi fechado');
    if (!alive) await start();
  };
  await start();

  // Antes de cada busca: o motor confirma que terminou tudo o que veio antes (isready → readyok).
  // Sem isso, uma resposta atrasada da busca anterior podia virar a avaliação da posição seguinte
  // (pranav-giri: −2,3 depois de 1.e4, e o 1…e6 saiu como "erro decisivo")
  async function sync() {
    send('isready');
    await waitFor((l) => l === 'readyok', 20000);
  }

  // Espera o fim da busca. Se passar do prazo, manda parar e espera o bestmove dela: o readyok vem
  // mesmo com a busca rodando, então sem isso ela continuaria e responderia por cima da próxima
  async function finish() {
    try {
      await waitFor((l) => l.startsWith('bestmove'));
    } catch (e) {
      if (alive) {
        send('stop');
        await waitFor((l) => l.startsWith('bestmove'), 5000).catch(() => {});
      }
      throw e;
    }
  }

  /** Partida nova: zera a memória do motor (tabela de transposição e históricos da partida anterior). */
  async function newGame() {
    await ready();
    send('ucinewgame');
    await sync();
  }

  /** Avaliação em peões do ponto de vista das brancas (mate = ±20). */
  async function evaluate(fen) {
    const pos = new Chess(fen);
    if (pos.isCheckmate()) return pos.turn() === 'w' ? -MATE : MATE;
    if (pos.isStalemate() || pos.isInsufficientMaterial()) return 0;
    await ready();
    await sync();
    // só a avaliação exata da maior profundidade: linha com lowerbound/upperbound é provisória
    let score = null;
    let best = -1;
    const collect = (line) => {
      const m = line.match(/^info .*?\bdepth (\d+)\b.*? score (cp|mate) (-?\d+)/);
      if (!m || / multipv [2-9]/.test(line) || / (lower|upper)bound/.test(line)) return;
      const dep = Number(m[1]);
      if (dep < best) return;
      best = dep;
      score = m[2] === 'mate' ? (Number(m[3]) > 0 ? MATE : -MATE) : Number(m[3]) / 100;
    };
    listeners.add(collect);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
    try {
      await finish();
    } finally {
      listeners.delete(collect);
    }
    if (score == null) return null;
    const pov = pos.turn() === 'w' ? score : -score;
    return Math.max(-MATE, Math.min(MATE, pov));
  }

  /**
   * Análise com a linha principal (e as alternativas, com multipv > 1).
   * score: peões do ponto de vista das brancas (mate = ±20); mateIn: lances até o mate, positivo se
   * as brancas dão mate; bestmove e pv já em SAN. lines: uma por multipv, na ordem do motor.
   * movetime é teto de tempo (ms): com MultiPV a busca funda pode levar um minuto.
   */
  async function analyse(fen, { depth: d = depth, multipv = 1, movetime } = {}) {
    const pos = new Chess(fen);
    if (pos.isCheckmate()) return { score: pos.turn() === 'w' ? -MATE : MATE, mateIn: 0, bestmove: null, pv: [], lines: [] };
    if (pos.isStalemate() || pos.isInsufficientMaterial()) return { score: 0, mateIn: null, bestmove: null, pv: [], lines: [] };
    await ready();
    await sync();
    const sign = pos.turn() === 'w' ? 1 : -1;
    const lines = new Map(); // multipv → última linha exata (sem lowerbound/upperbound)
    const collect = (line) => {
      if (!line.startsWith('info ') || !line.includes(' pv ') || / (lower|upper)bound/.test(line)) return;
      const m = line.match(/ score (cp|mate) (-?\d+)/);
      if (!m) return;
      const n = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
      lines.set(n, { kind: m[1], v: Number(m[2]), pv: line.slice(line.indexOf(' pv ') + 4).trim().split(/\s+/) });
    };
    listeners.add(collect);
    if (multipv > 1) send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${fen}`);
    send(`go depth ${d}${movetime ? ` movetime ${movetime}` : ''}`);
    try {
      await finish();
    } finally {
      listeners.delete(collect);
      // volta ao normal: evaluate() e as próximas buscas rodam com uma linha só
      if (multipv > 1) send('setoption name MultiPV value 1');
    }
    const out = [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, x]) => {
        const mate = x.kind === 'mate' ? x.v * sign : null; // do lado das brancas
        const score = mate != null ? (mate > 0 ? MATE : -MATE) : Math.max(-MATE, Math.min(MATE, (x.v * sign) / 100));
        const pv = toSan(fen, x.pv);
        return { san: pv[0] ?? null, score, mateIn: mate, pv };
      })
      .filter((l) => l.san);
    if (!out.length) return { score: null, mateIn: null, bestmove: null, pv: [], lines: [] };
    return { score: out[0].score, mateIn: out[0].mateIn, bestmove: out[0].san, pv: out[0].pv, lines: out };
  }

  return {
    newGame,
    evaluate,
    analyse,
    quit() {
      closed = true;
      const p = proc;
      send('quit');
      setTimeout(() => p.kill(), 500);
    },
  };
}
