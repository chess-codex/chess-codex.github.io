import { Ionicons } from '@expo/vector-icons';
import { Chess, type Square } from 'chess.js';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { track } from '@/lib/analytics';
import { fig, fmtEval, gameStory, keyCaption, keyTitle, moveLabel, puzzlePly, resultLabel, sideName, winnerName, type Ending, type Game } from '@/lib/games';
import { gameRevealId, useResultHidden } from '@/lib/spoiler';
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

// ritmo do "rodar a partida": dá tempo de ver o lance sem arrastar
const AUTOPLAY_MS = 1100;

/** Aviso no lugar do que entregaria o resultado no Anti-Spoiler; um toque revela a partida. */
export function ResultVeil({ label = 'Resultado oculto: toque em mostrar', onPress }: { label?: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Mostrar resultado da partida"
      style={({ pressed }) => [styles.veil, { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="eye-off" size={14} color={c.muted} />
      <Text style={[styles.veilTxt, { color: c.muted }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Tabuleiro da notícia. Abre logo depois do erro decisivo com um desafio jogável
 * ("ache o lance que puniu o erro"); depois deixa navegar pela partida inteira.
 * `onReveal` avisa a página quando o resultado é revelado aqui (a notícia revela junto).
 */
export function MiniBoard({ game, ply, caption, showLink = true, onReveal }: { game: Game; ply?: number; caption?: string; showLink?: boolean; onReveal?: () => void }) {
  const c = usePalette();
  const puzzle = ply == null ? puzzlePly(game) : null;
  const start = puzzle ?? ply ?? game.keyPly; // posição inicial = antes do lance em destaque
  const [cur, setCur] = useState(start);
  const [solved, setSolved] = useState(false);
  // "revealed" aqui é a resposta do desafio; o resultado da partida é do Anti-Spoiler (hideResult)
  const [revealed, setRevealed] = useState(puzzle == null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [width, setWidth] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const { settings, reveal } = useStore();
  const hideResult = useResultHidden(game.key);
  const positions = usePositions(game);

  // saiu da tela (partida completa, fonte no navegador): pausa, senão a partida corre escondida
  useFocusEffect(useCallback(() => () => setAutoplay(false), []));

  // desafio em andamento (não confundir com o autoplay, que roda a partida sozinho)
  const challenge = puzzle != null && !revealed && cur === puzzle;
  const total = game.moves.length;
  const running = autoplay && cur < total;
  const last = positions.lastMoves[cur];
  const evalNow = cur === 0 ? 0.2 : game.evals[cur - 1];
  const whiteShare = Math.max(4, Math.min(96, 50 + (Math.max(-6, Math.min(6, evalNow)) / 6) * 50));
  // avaliação à mostra entrega a resposta no desafio e o desfecho no Anti-Spoiler: barra no meio e número oculto
  const evalHidden = challenge || hideResult;
  // largura menos a barra de avaliação; teto para o tabuleiro não ficar gigante em tela grande
  const boardSize = Math.min(520, Math.max(0, width - 14));
  const shown = start;
  const arrow = revealed && cur === shown + 1 ? positions.lastMoves[shown + 1] : null;

  const targets = useMemo(() => {
    if (!challenge || !selected) return [];
    return new Chess(positions.fens[cur]).moves({ square: selected as Square, verbose: true }).map((m) => m.to);
  }, [challenge, selected, positions, cur]);

  // um lance por vez; no último o autoplay desliga, e lances novos de partida ao vivo não o religam
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      setCur((v) => Math.min(total, v + 1));
      if (cur + 1 >= total) setAutoplay(false);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [running, cur, total]);

  const revealResult = () => {
    reveal(gameRevealId(game.key));
    onReveal?.();
  };

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
      track('challenge_solved', { game: game.key });
    } else {
      setTries((t) => t + 1);
      setFeedback(`${fig(san)} não foi o lance da partida. Tente de novo.`);
    }
  };

  // toda navegação manual (botões, gráfico, Revelar) pausa o autoplay
  const go = (v: number) => {
    setAutoplay(false);
    setCur(Math.max(0, Math.min(total, v)));
    setRevealed(true);
    setSelected(null);
    setFeedback(null);
  };

  const toggleAutoplay = () => {
    if (running) {
      setAutoplay(false);
      return;
    }
    // no desafio, o play é escolha explícita: revela a resposta e roda a partida desde o começo
    if (challenge) track('challenge_revealed', { game: game.key });
    if (challenge || cur >= total) setCur(0);
    setAutoplay(true);
    setRevealed(true);
    setSelected(null);
    setFeedback(null);
    track('autoplay', { game: game.key });
  };

  const winner = winnerName(game);
  const errorBy = game.keyPly % 2 === 0 ? game.whiteSurname : game.blackSurname;
  // no Anti-Spoiler nenhum texto do tabuleiro cita o vencedor antes de revelar
  const punish = hideResult || !winner ? 'ache o lance que puniu o erro.' : `ache o lance com que ${winner} puniu o erro.`;
  const answer = puzzle == null || solved ? '' : hideResult || !winner ? ` O lance da partida foi ${moveLabel(game, puzzle)}.` : ` ${winner} puniu com ${moveLabel(game, puzzle)}.`;
  const playHint = challenge
    ? 'Revela a resposta do desafio e roda a partida desde o primeiro lance'
    : running ? 'Para a partida no lance atual' : 'Mostra a partida lance a lance, sozinha';

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
        {hideResult ? (
          <Pressable onPress={revealResult} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mostrar resultado da partida">
            <Text style={[styles.result, { color: c.whisky }]}>•–•</Text>
          </Pressable>
        ) : (
          <Text style={[styles.result, { color: c.whisky }]}>{resultLabel(game)}</Text>
        )}
      </View>

      {challenge ? (
        <View style={[styles.quiz, { backgroundColor: c.whiskySoft }]}>
          <Text style={[styles.quizTitle, { color: c.whisky }]}>DESAFIO · SUA VEZ</Text>
          {/* No Anti-Spoiler os números da avaliação somem. O limite que fica: o próprio desafio diz
              que o lado que joga pode punir um erro, então a vantagem desse lado continua implícita */}
          <Text style={[styles.quizText, { color: c.ink }]}>
            {hideResult
              ? `${errorBy} acabou de jogar ${moveLabel(game, game.keyPly)}, um erro.`
              : `${errorBy} acabou de jogar ${moveLabel(game, game.keyPly)} e a avaliação foi de ${fmtEval(game.keyBefore)} para ${fmtEval(game.keyAfter)}.`}
            {' '}Jogam as {sideName(cur % 2 === 0)}: {punish}
          </Text>
          <Text style={[styles.hint, { color: c.muted }]}>Toque na peça e depois na casa de destino.</Text>
        </View>
      ) : null}

      <View style={styles.boardRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.evalBar, { backgroundColor: '#1B1F2A' }]}>
          <View style={{ height: `${evalHidden ? 50 : whiteShare}%`, backgroundColor: '#F1EEE7', borderRadius: 3 }} />
        </View>
        {boardSize > 0 ? (
          <Board
            fen={positions.fens[cur]}
            size={boardSize}
            theme={settings.board}
            last={last}
            arrow={arrow}
            onSquare={challenge ? onSquare : undefined}
            selected={selected}
            targets={targets}
          />
        ) : null}
      </View>

      {challenge ? (
        <View style={styles.quizRow}>
          <Text style={[styles.feedback, { color: feedback ? c.danger : c.muted }]}>{feedback ?? ' '}</Text>
          <Pressable
            onPress={() => {
              track('challenge_revealed', { game: game.key });
              go(cur + 1);
            }}
            style={({ pressed }) => [styles.revealBtn, { backgroundColor: tries >= 2 ? c.whisky : c.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.revealTxt, { color: tries >= 2 ? c.surface : c.ink }]}>Revelar</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.caption, { color: c.inkSoft }]}>
          {solved ? <Text style={{ fontFamily: font.bold, color: '#3FB950' }}>Isso! {moveLabel(game, shown)} foi o lance da partida.{'\n'}</Text> : null}
          <Text style={{ fontFamily: font.bold, color: c.whisky }}>{keyTitle(game, hideResult)}: </Text>
          {/* legenda escrita à mão pode citar a avaliação: no Anti-Spoiler fica só a posição */}
          {hideResult
            ? ply != null && ply !== game.keyPly && ply < total
              ? `Posição antes de ${moveLabel(game, ply)}.`
              : keyCaption(game, true)
            : (caption ?? keyCaption(game))}
          {answer}
        </Text>
      )}

      {/* o gráfico entregaria a resposta durante o desafio e o desfecho no Anti-Spoiler */}
      {challenge ? null : hideResult ? (
        <ResultVeil label="Gráfico e resultado ocultos: toque em mostrar" onPress={revealResult} />
      ) : (
        <EvalGraph evals={game.evals} keyPly={game.keyPly} cur={cur} onSeek={go} />
      )}

      <View style={styles.controls}>
        <Ctl icon="play-skip-back" label="Início da partida" onPress={() => go(0)} />
        <Ctl icon="chevron-back" label="Lance anterior" onPress={() => go(cur - 1)} />
        <View style={styles.moveInfo}>
          <Text style={[styles.moveTxt, { color: c.ink }]} numberOfLines={1} adjustsFontSizeToFit>
            {cur === 0 ? 'Início' : moveLabel(game, cur - 1)}
          </Text>
          <Text style={[styles.evalTxt, { color: c.muted }]} numberOfLines={1} adjustsFontSizeToFit>
            {evalHidden ? 'avaliação oculta' : fmtEval(evalNow)}
          </Text>
        </View>
        <Ctl icon="chevron-forward" label="Próximo lance" onPress={() => go(cur + 1)} />
        <Ctl icon={running ? 'pause' : 'play'} label={running ? 'Pausar' : 'Rodar a partida'} hint={playHint} onPress={toggleAutoplay} />
        <Ctl icon="locate" label="Ir ao lance decisivo" onPress={() => go(game.keyPly)} />
      </View>

      {showLink ? (
        <Pressable
          onPress={() => {
            setAutoplay(false);
            router.push({ pathname: '/game/[key]', params: { key: game.key } });
          }}
          style={styles.more}
        >
          <Text style={[styles.moreTxt, { color: c.accent }]}>Abrir a partida completa</Text>
          <Ionicons name="chevron-forward" size={14} color={c.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * "A partida em texto": relato em parágrafos, só com dados da partida.
 * No Anti-Spoiler vira um aviso neutro até revelar, porque o relato diz quem venceu.
 */
export function GameStory({ game, onReveal }: { game: Game; onReveal?: () => void }) {
  const c = usePalette();
  const { reveal } = useStore();
  const hideResult = useResultHidden(game.key);
  const { ending } = usePositions(game);
  if (hideResult) {
    return (
      <ResultVeil
        onPress={() => {
          reveal(gameRevealId(game.key));
          onReveal?.();
        }}
      />
    );
  }
  const paragraphs = gameStory(game, ending);
  return (
    <View style={{ gap: 10 }}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={[styles.story, { color: i === 0 ? c.ink : c.inkSoft }]}>{p}</Text>
      ))}
    </View>
  );
}

function Ctl({ icon, label, hint, onPress, disabled = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; onPress: () => void; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.ctl, { backgroundColor: c.surfaceAlt, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
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
  boardRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginHorizontal: -4 },
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
  veil: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  veilTxt: { fontFamily: font.medium, fontSize: 13.5, flexShrink: 1 },
  // 5 botões + lance: em telas de 360dp o miolo precisa caber sem quebrar linha
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctl: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moveInfo: { flex: 1, alignItems: 'center' },
  moveTxt: { fontFamily: font.semibold, fontSize: 14 },
  evalTxt: { fontFamily: font.regular, fontSize: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  moreTxt: { fontFamily: font.semibold, fontSize: 13.5 },
  story: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
});
