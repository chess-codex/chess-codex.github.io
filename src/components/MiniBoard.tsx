import { Ionicons } from '@expo/vector-icons';
import { Chess } from 'chess.js';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import games from '@/data/games.json';
import { font, radius, usePalette } from '@/lib/theme';
import { useStore } from '@/lib/store';
import { Board } from './Board';

type Game = {
  white: string; black: string; whiteElo: string; blackElo: string; result: string;
  opening: string; url: string; moves: string[]; evals: number[]; turningPly: number;
};

// SAN inglês -> notação em português (R rei, D dama, T torre, B bispo, C cavalo)
const PT: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'B', N: 'C' };
const pt = (san: string) => san.replace(/[KQRBN]/g, (m) => PT[m]);

function surname(n: string) {
  return n.split(',')[0].replace(/ D$/, '');
}

function fmtEval(e: number | undefined) {
  if (e == null) return '0,0';
  if (Math.abs(e) >= 99) return e > 0 ? '#' : '-#';
  return (e > 0 ? '+' : '') + e.toFixed(1).replace('.', ',');
}

/**
 * Tabuleiro leve embutido na notícia. Abre na posição-chave como desafio
 * ("qual foi o lance?") e deixa o leitor navegar pela partida inteira.
 */
export function MiniBoard({ gameKey, ply, caption }: { gameKey: string; ply?: number; caption: string }) {
  const c = usePalette();
  const game = (games as Record<string, Game>)[gameKey];
  const start = ply ?? game.turningPly;
  const [cur, setCur] = useState(start);
  const [revealed, setRevealed] = useState(false);
  const [width, setWidth] = useState(0);
  const { settings } = useStore();

  const positions = useMemo(() => {
    const ch = new Chess();
    const fens = [ch.fen()];
    const lastMoves: ({ from: string; to: string } | null)[] = [null];
    for (const m of game.moves) {
      const mv = ch.move(m);
      fens.push(ch.fen());
      lastMoves.push({ from: mv.from, to: mv.to });
    }
    return { fens, lastMoves };
  }, [game]);

  const last = positions.lastMoves[cur];
  const toMove = cur % 2 === 0 ? 'Brancas' : 'Pretas';
  const keyMove = pt(game.moves[start]);
  const keyLabel = `${Math.floor(start / 2) + 1}${start % 2 === 0 ? '.' : '…'} ${keyMove}`;
  const evalNow = cur === 0 ? 0.2 : game.evals[cur - 1];
  // barra de avaliação: 50% = igual, satura em ±6
  const whiteShare = Math.max(4, Math.min(96, 50 + (Math.max(-6, Math.min(6, evalNow)) / 6) * 50));

  const boardSize = Math.max(0, width - 14); // largura menos a barra de avaliação
  const keyArrow = revealed && cur === start + 1 ? positions.lastMoves[start + 1] : null;
  const step = (d: number) => {
    setCur((v) => Math.max(0, Math.min(game.moves.length, v + d)));
    setRevealed(true);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.headRow}>
        <Text style={[styles.players, { color: c.ink }]} numberOfLines={1}>
          {surname(game.white)} <Text style={{ color: c.muted }}>×</Text> {surname(game.black)}
        </Text>
        <Text style={[styles.result, { color: c.whisky }]}>{revealed ? game.result : '•–•'}</Text>
      </View>
      <Text style={[styles.opening, { color: c.muted }]} numberOfLines={1}>{game.opening}</Text>

      <View style={styles.boardRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.evalBar, { backgroundColor: '#1B1F2A' }]}>
          <View style={{ height: `${whiteShare}%`, backgroundColor: '#F1EEE7', borderRadius: 3 }} />
        </View>
        {boardSize > 0 ? (
          <Board fen={positions.fens[cur]} size={boardSize} theme={settings.board} last={last} arrow={keyArrow} />
        ) : null}
      </View>

      {!revealed && cur === start ? (
        <View style={[styles.quiz, { backgroundColor: c.whiskySoft }]}>
          <Text style={[styles.quizTitle, { color: c.whisky }]}>DESAFIO DA NOTÍCIA</Text>
          <Text style={[styles.quizText, { color: c.ink }]}>
            {toMove} jogam. O motor marca {fmtEval(evalNow)}. Qual lance mudou a partida?
          </Text>
          <Pressable
            onPress={() => { setRevealed(true); setCur(start + 1); }}
            style={({ pressed }) => [styles.revealBtn, { backgroundColor: c.whisky, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.revealTxt, { color: c.surface }]}>Revelar lance</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.caption, { color: c.inkSoft }]}>
          <Text style={{ fontFamily: font.bold, color: c.whisky }}>{keyLabel}  </Text>
          {caption}
        </Text>
      )}

      <View style={styles.controls}>
        <Ctl icon="play-skip-back" onPress={() => { setCur(0); setRevealed(true); }} />
        <Ctl icon="chevron-back" onPress={() => step(-1)} />
        <View style={styles.moveInfo}>
          <Text style={[styles.moveTxt, { color: c.ink }]}>
            {cur === 0 ? 'Início' : `${Math.floor((cur - 1) / 2) + 1}${(cur - 1) % 2 === 0 ? '.' : '…'} ${pt(game.moves[cur - 1])}`}
          </Text>
          <Text style={[styles.evalTxt, { color: c.muted }]}>{fmtEval(evalNow)}</Text>
        </View>
        <Ctl icon="chevron-forward" onPress={() => step(1)} />
        <Ctl icon="locate" onPress={() => { setCur(start); }} />
      </View>
    </View>
  );
}

function Ctl({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.ctl, { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={c.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10, marginHorizontal: -8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  players: { fontFamily: font.bold, fontSize: 16, flexShrink: 1 },
  result: { fontFamily: font.bold, fontSize: 15, letterSpacing: 0.5 },
  opening: { fontFamily: font.regular, fontSize: 12, marginTop: -6 },
  boardRow: { flexDirection: 'row', gap: 6, marginHorizontal: -4 },
  evalBar: { width: 8, borderRadius: 3, overflow: 'hidden', flexDirection: 'column-reverse' },
  quiz: { borderRadius: radius.md, padding: 12, gap: 6 },
  quizTitle: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  quizText: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  revealBtn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  revealTxt: { fontFamily: font.semibold, fontSize: 14 },
  caption: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctl: { width: 38, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moveInfo: { flex: 1, alignItems: 'center' },
  moveTxt: { fontFamily: font.semibold, fontSize: 14 },
  evalTxt: { fontFamily: font.regular, fontSize: 12 },
});
