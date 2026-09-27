import { Chess } from 'chess.js';
import { router } from 'expo-router';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmtEval, keyTitle, moveLabel, resultLabel, type Game } from '@/lib/games';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';
import { Board } from './Board';

const SIZE = 144;

/** Card da Home: a posição decisiva congelada, jogadores e o que aconteceu. */
export const GameCard = memo(function GameCard({ game }: { game: Game }) {
  const c = usePalette();
  const { settings } = useStore();
  const { fen, last } = useMemo(() => {
    const ch = new Chess();
    let mv = null;
    for (let i = 0; i < game.keyPly; i++) mv = ch.move(game.moves[i]);
    return { fen: ch.fen(), last: mv ? { from: mv.from, to: mv.to } : null };
  }, [game]);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[key]', params: { key: game.key } })}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.hairline, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={styles.boardWrap}>
        <Board fen={fen} size={SIZE} theme={settings.board} last={last} />
      </View>
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: c.whiskySoft }]}>
          <Text style={[styles.badgeTxt, { color: c.whisky }]}>{keyTitle(game)}</Text>
        </View>
        <Text style={[styles.players, { color: c.ink }]} numberOfLines={1}>{game.whiteSurname}</Text>
        <Text style={[styles.players, { color: c.ink }]} numberOfLines={1}>{game.blackSurname}</Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {settings.antiSpoiler ? game.round : `${resultLabel(game)} · ${game.round}`}
        </Text>
        <Text style={[styles.key, { color: c.inkSoft }]} numberOfLines={2}>
          {settings.antiSpoiler ? 'Toque para ver a posição decisiva' : `${moveLabel(game, game.keyPly)}: ${fmtEval(game.keyBefore)} → ${fmtEval(game.keyAfter)}`}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { width: SIZE + 24, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  boardWrap: { alignItems: 'center' },
  body: { gap: 3 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 3 },
  badgeTxt: { fontFamily: font.bold, fontSize: 11 },
  players: { fontFamily: font.bold, fontSize: 14.5 },
  meta: { fontFamily: font.medium, fontSize: 12, marginTop: 2 },
  key: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
});
