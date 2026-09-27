import { Ionicons } from '@expo/vector-icons';
import { Chess, type Square } from 'chess.js';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fig, fmtEval, gameStory, keyCaption, keyTitle, moveLabel, puzzlePly, resultLabel, sideName, winnerName, type Ending, type Game } from '@/lib/games';
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
    const ending: Ending = {
      mate: ch.isCheckmate(),
      stalemate: ch.isStalemate(),
      repetition: ch.isThreefoldRepetition(),
      insufficient: ch.isInsufficientMaterial(),
    };
    return { fens, lastMoves, ending };
  }, [game]);
}

const clean = (san: string) => san.replace(/[+#!?]/g, '');

/**
 * Tabuleiro da notícia. Abre logo depois do erro decisivo com um desafio jogável
 * ("ache o lance que puniu o erro"); depois deixa navegar pela partida inteira.
 */
export function MiniBoard({ game, ply, caption, showLink = true }: { game: Game; ply?: number; caption?: string; showLink?: boolean }) {
  const c = usePalette();
  const puzzle = ply == null ? puzzlePly(game) : null;
  const start = puzzle ?? ply ?? game.keyPly; // posição inicial = antes do lance em destaque
  const [cur, setCur] = useState(start);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(puzzle == null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [width, setWidth] = useState(0);
  const { settings } = useStore();
  const positions = usePositions(game);

  const playing = puzzle != null && !revealed && cur === puzzle;
  const last = positions.lastMoves[cur];
  const evalNow = cur === 0 ? 0.2 : game.evals[cur - 1];
  const whiteShare = Math.max(4, Math.min(96, 50 + (Math.max(-6, Math.min(6, evalNow)) / 6) * 50));
  const boardSize = Math.max(0, width - 14);
  const shown = start;
  const arrow = revealed && cur === shown + 1 ? positions.lastMoves[shown + 1] : null;

  const targets = useMemo(() => {
    if (!playing || !selected) return [];
    return new Chess(positions.fens[cur]).moves({ square: selected as Square, verbose: true }).map((m) => m.to);
  }, [playing, selected, positions, cur]);

  const onSquare = (sq: string) => {
    const board = new Chess(positions.fens[cur]);
    const piece = board.get(sq as Square);
    if (!selected || (piece && piece.color === board.turn())) {
      setSelected(piece && piece.color === board.turn() ? sq : null);
      return;
    }
    let san: string | null = null;
    try {
      san = board.move({ from: selected, to: sq, promotion: 'q' }).san;
    } catch {
      setSelected(null);
      return;
    }
    setSelected(null);
    if (clean(san) === clean(game.moves[cur])) {
      setSolved(true);
      setRevealed(true);
      setFeedback(null);
      setCur(cur + 1);
    } else {
      setTries((t) => t + 1);
      setFeedback(`${fig(san)} não foi o lance da partida. Tente de novo.`);
    }
  };

  const go = (v: number) => {
    setCur(Math.max(0, Math.min(game.moves.length, v)));
    setRevealed(true);
    setSelected(null);
    setFeedback(null);
  };

  const winner = winnerName(game);
  const errorBy = game.keyPly % 2 === 0 ? game.whiteSurname : game.blackSurname;

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

      {playing ? (
        <View style={[styles.quiz, { backgroundColor: c.whiskySoft }]}>
          <Text style={[styles.quizTitle, { color: c.whisky }]}>DESAFIO · SUA VEZ</Text>
          <Text style={[styles.quizText, { color: c.ink }]}>
            {errorBy} acabou de jogar {moveLabel(game, game.keyPly)} e a avaliação foi de {fmtEval(game.keyBefore)} para {fmtEval(game.keyAfter)}.
            {' '}Jogam as {sideName(cur % 2 === 0)}: ache o lance com que {winner} puniu o erro.
          </Text>
          <Text style={[styles.hint, { color: c.muted }]}>Toque na peça e depois na casa de destino.</Text>
        </View>
      ) : null}

      <View style={styles.boardRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.evalBar, { backgroundColor: '#1B1F2A' }]}>
          <View style={{ height: `${playing ? 50 : whiteShare}%`, backgroundColor: '#F1EEE7', borderRadius: 3 }} />
        </View>
        {boardSize > 0 ? (
          <Board
            fen={positions.fens[cur]}
            size={boardSize}
            theme={settings.board}
            last={last}
            arrow={arrow}
            onSquare={playing ? onSquare : undefined}
            selected={selected}
            targets={targets}
          />
        ) : null}
      </View>

      {playing ? (
        <View style={styles.quizRow}>
          <Text style={[styles.feedback, { color: feedback ? c.danger : c.muted }]}>{feedback ?? ' '}</Text>
          <Pressable
            onPress={() => go(cur + 1)}
            style={({ pressed }) => [styles.revealBtn, { backgroundColor: tries >= 2 ? c.whisky : c.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.revealTxt, { color: tries >= 2 ? c.surface : c.ink }]}>Revelar</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.caption, { color: c.inkSoft }]}>
          {solved ? <Text style={{ fontFamily: font.bold, color: '#3FB950' }}>Isso! {moveLabel(game, shown)} foi o lance da partida.{'\n'}</Text> : null}
          <Text style={{ fontFamily: font.bold, color: c.whisky }}>{keyTitle(game)}: </Text>
          {caption ?? keyCaption(game)}
          {puzzle != null && !solved ? ` ${winner} puniu com ${moveLabel(game, puzzle)}.` : ''}
        </Text>
      )}

      {/* o gráfico entregaria a resposta durante o desafio */}
      {playing ? null : <EvalGraph evals={game.evals} keyPly={game.keyPly} cur={cur} onSeek={go} />}

      <View style={styles.controls}>
        <Ctl icon="play-skip-back" onPress={() => go(0)} />
        <Ctl icon="chevron-back" onPress={() => go(cur - 1)} />
        <View style={styles.moveInfo}>
          <Text style={[styles.moveTxt, { color: c.ink }]}>{cur === 0 ? 'Início' : moveLabel(game, cur - 1)}</Text>
          <Text style={[styles.evalTxt, { color: c.muted }]}>{playing ? 'avaliação oculta' : fmtEval(evalNow)}</Text>
        </View>
        <Ctl icon="chevron-forward" onPress={() => go(cur + 1)} />
        <Ctl icon="locate" onPress={() => go(game.keyPly)} />
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

/** "A partida em texto": relato em parágrafos, só com dados da partida. */
export function GameStory({ game }: { game: Game }) {
  const c = usePalette();
  const { ending } = usePositions(game);
  const paragraphs = gameStory(game, ending);
  return (
    <View style={{ gap: 10 }}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={[styles.story, { color: i === 0 ? c.ink : c.inkSoft }]}>{p}</Text>
      ))}
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
  hint: { fontFamily: font.regular, fontSize: 12.5 },
  quizRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedback: { flex: 1, fontFamily: font.medium, fontSize: 13.5 },
  revealBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  revealTxt: { fontFamily: font.semibold, fontSize: 14 },
  caption: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctl: { width: 38, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moveInfo: { flex: 1, alignItems: 'center' },
  moveTxt: { fontFamily: font.semibold, fontSize: 14 },
  evalTxt: { fontFamily: font.regular, fontSize: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  moreTxt: { fontFamily: font.semibold, fontSize: 13.5 },
  story: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
});
