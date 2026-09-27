import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniBoard } from '@/components/MiniBoard';
import { openExternal } from '@/components/ui';
import { fmtClock, fmtEval, keyCaption, keyTitle, moveLabel, resultLabel, useGame } from '@/lib/games';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';

export default function GameScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  const game = useGame(key);
  const { settings } = useStore();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!game) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg, paddingTop: insets.top + 40 }]}>
        <Text style={[styles.emptyTxt, { color: c.muted }]}>Esta partida saiu da edição de hoje.</Text>
        <Pressable onPress={back}>
          <Text style={[styles.link, { color: c.accent }]}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  // dados que saem direto do PGN e da análise do motor
  const facts = [
    { label: 'Resultado', value: settings.antiSpoiler ? '•–•' : resultLabel(game) },
    { label: 'Lances', value: String(Math.ceil(game.moves.length / 2)) },
    { label: 'Momento-chave', value: `${fmtEval(game.keyBefore)} → ${fmtEval(game.keyAfter)}` },
    ...(game.keyClock != null ? [{ label: 'Relógio no lance', value: fmtClock(game.keyClock) }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, borderBottomColor: c.hairline }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Voltar</Text>
        </Pressable>
        <Pressable
          onPress={() => Share.share({ message: `${game.white} x ${game.black} (${game.event}, ${game.round})\n${keyCaption(game)}\n${game.url}\n\nvia Chess Codex` })}
          hitSlop={10}
        >
          <Ionicons name="share-outline" size={22} color={c.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={[styles.kicker, { color: c.whisky }]}>{`${keyTitle(game)} · ${game.round}`.toUpperCase()}</Text>
          <Text style={[styles.title, { color: c.ink }]}>
            {game.white} <Text style={{ color: c.muted }}>×</Text> {game.black}
          </Text>
          <Text style={[styles.meta, { color: c.muted }]}>
            {[game.event, game.whiteTeam && game.blackTeam ? `${game.whiteTeam} × ${game.blackTeam}` : null, game.opening].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.fact, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Text style={[styles.factVal, { color: c.ink }]}>{f.value}</Text>
              <Text style={[styles.factLbl, { color: c.muted }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        <MiniBoard game={game} showLink={false} />

        <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Text style={[styles.blockLabel, { color: c.muted }]}>LANCES</Text>
          <Text style={[styles.moves, { color: c.inkSoft }]}>
            {game.moves.map((_, i) => (
              <Text key={i} style={i === game.keyPly ? { color: c.whisky, fontFamily: font.bold } : undefined}>
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                {moveLabel(game, i).split(' ')[1]}{' '}
              </Text>
            ))}
          </Text>
        </View>

        {game.url ? (
          <Pressable onPress={() => openExternal(game.url)} style={[styles.cta, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <Ionicons name="open-outline" size={18} color={c.accent} />
            <Text style={[styles.ctaTxt, { color: c.accent }]}>Ver no Lichess, com análise completa</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.note, { color: c.muted }]}>Partida e avaliações do motor: transmissão oficial no Lichess.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', gap: 12 },
  emptyTxt: { fontFamily: font.regular, fontSize: 15 },
  link: { fontFamily: font.semibold, fontSize: 15 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  kicker: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1.1 },
  title: { fontFamily: font.black, fontSize: 26, lineHeight: 31, letterSpacing: -0.6 },
  meta: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, minWidth: '45%', borderRadius: radius.md, padding: 12, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  factVal: { fontFamily: font.black, fontSize: 19, letterSpacing: -0.4 },
  factLbl: { fontFamily: font.medium, fontSize: 11.5 },
  block: { borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  blockLabel: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  moves: { fontFamily: font.regular, fontSize: 14, lineHeight: 22 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  ctaTxt: { fontFamily: font.semibold, fontSize: 15 },
  note: { fontFamily: font.regular, fontSize: 12, textAlign: 'center' },
});
