import { Ionicons } from '@expo/vector-icons';
import { Chess } from 'chess.js';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmtEval, keyCaption, keyTitle, moveLabel, resultLabel, type Game } from '@/lib/games';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';
import { Board } from './Board';
import { EvalGraph } from './EvalGraph';

export function usePositions(game: Game) {
  return useMemo(() => {
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
}

/**
 * Tabuleiro da notícia. Abre na posição decisiva como desafio ("qual lance mudou a partida?")
 * e deixa navegar pela partida inteira, com o gráfico de avaliação do motor.
 */
export function MiniBoard({ game, ply, caption, showLink = true }: { game: Game; ply?: number; caption?: string; showLink?: boolean }) {
  const c = usePalette();
  const start = ply ?? game.keyPly;
  const [cur, setCur] = useState(start);
  const [revealed, setRevealed] = useState(false);
  const [width, setWidth] = useState(0);
  const { settings } = useStore();
  const positions = usePositions(game);

  const last = positions.lastMoves[cur];
  const toMove = cur % 2 === 0 ? 'Brancas' : 'Pretas';
  const evalNow = cur === 0 ? 0.2 : game.evals[cur - 1];
  // barra de avaliação: 50% = igual, satura em ±6
  const whiteShare = Math.max(4, Math.min(96, 50 + (Math.max(-6, Math.min(6, evalNow)) / 6) * 50));
  const boardSize = Math.max(0, width - 14); // largura menos a barra de avaliação
  const keyArrow = revealed && cur === start + 1 ? positions.lastMoves[start + 1] : null;
  const text = caption ?? keyCaption(game);

  const go = (v: number) => {
    setCur(Math.max(0, Math.min(game.moves.length, v)));
    setRevealed(true);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.players, { color: c.ink }]} numberOfLines={1}>
            {game.whiteSurname} <Text style={[styles.elo, { color: c.muted }]}>{game.whiteElo || ''}</Text>
            <Text style={{ color: c.muted }}>  ×  </Text>
            {game.blackSurname} <Text style={[styles.elo, { color: c.muted }]}>{game.blackElo || ''}</Text>
          </Text>
          <Text style={[styles.opening, { color: c.muted }]} numberOfLines={1}>
            {[game.round, game.opening].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={[styles.result, { color: c.whisky }]}>{revealed || !settings.antiSpoiler ? resultLabel(game) : '•–•'}</Text>
      </View>

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
          <Text style={[styles.quizTitle, { color: c.whisky }]}>{keyTitle(game).toUpperCase()} · DESAFIO</Text>
          <Text style={[styles.quizText, { color: c.ink }]}>
            {toMove} jogam. O motor marca {fmtEval(evalNow)}. Qual lance mudou a partida?
          </Text>
          <Pressable
            onPress={() => go(start + 1)}
            style={({ pressed }) => [styles.revealBtn, { backgroundColor: c.whisky, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.revealTxt, { color: c.surface }]}>Revelar lance</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.caption, { color: c.inkSoft }]}>
          <Text style={{ fontFamily: font.bold, color: c.whisky }}>{moveLabel(game, start)}  </Text>
          {text}
        </Text>
      )}

      <EvalGraph evals={game.evals} keyPly={start} cur={cur} onSeek={go} />

      <View style={styles.controls}>
        <Ctl icon="play-skip-back" onPress={() => go(0)} />
        <Ctl icon="chevron-back" onPress={() => go(cur - 1)} />
        <View style={styles.moveInfo}>
          <Text style={[styles.moveTxt, { color: c.ink }]}>{cur === 0 ? 'Início' : moveLabel(game, cur - 1)}</Text>
          <Text style={[styles.evalTxt, { color: c.muted }]}>{fmtEval(evalNow)}</Text>
        </View>
        <Ctl icon="chevron-forward" onPress={() => go(cur + 1)} />
        <Ctl icon="locate" onPress={() => setCur(start)} />
      </View>

      {showLink ? (
        <Pressable onPress={() => router.push({ pathname: '/game/[key]', params: { key: game.key } })} style={styles.more}>
          <Text style={[styles.moreTxt, { color: c.accent }]}>Abrir a partida completa</Text>
          <Ionicons name="chevron-forward" size={14} color={c.accent} />
        </Pressable>
      ) : null}
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
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  players: { fontFamily: font.bold, fontSize: 16 },
  elo: { fontFamily: font.medium, fontSize: 12 },
  result: { fontFamily: font.bold, fontSize: 16, letterSpacing: 0.5 },
  opening: { fontFamily: font.regular, fontSize: 12, marginTop: 2 },
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
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  moreTxt: { fontFamily: font.semibold, fontSize: 13.5 },
});
