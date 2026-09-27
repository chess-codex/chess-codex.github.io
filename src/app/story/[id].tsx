import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameStory, MiniBoard } from '@/components/MiniBoard';
import { SaveButton, SourceTag, SpoilerTitle, openExternal } from '@/components/ui';
import { useArticles } from '@/lib/digest';
import { useGame } from '@/lib/games';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';

export default function Story() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, revealed, reveal } = useStore();
  const a = useArticles().find((x) => x.id === id);
  const game = useGame(a?.game?.key);
  if (!a) return null;

  const hidden = settings.antiSpoiler && a.spoiler && !revealed.has(a.id);
  const s = settings.textScale;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: c.bg, borderBottomColor: c.hairline }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Hoje</Text>
        </Pressable>
        <View style={styles.barRight}>
          <Pressable
            onPress={() => Share.share({ message: `${a.title}\n\n${(a.bullets ?? a.points?.map((p) => p.text) ?? []).map((b) => `• ${b}`).join('\n')}\n\nFonte: ${a.coverage[0].url}\nvia Chess Codex` })}
            hitSlop={10}
          >
            <Ionicons name="share-outline" size={22} color={c.ink} />
          </Pressable>
          <SaveButton id={a.id} size={22} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        {a.image ? (
          <Image source={a.image} style={[styles.cover, { backgroundColor: c.surfaceAlt }]} contentFit="cover" transition={250} />
        ) : null}
        <View style={{ gap: 10 }}>
          <Text style={[styles.kicker, { color: c.whisky }]}>{a.kicker.toUpperCase()}</Text>
          <SpoilerTitle id={a.id} text={a.title} safe={a.spoiler ? a.safeTitle : undefined} style={[styles.title, { color: c.ink, fontSize: 30 * s, lineHeight: 35 * s }]} />
          {hidden ? (
            <Pressable onPress={() => reveal(a.id)} style={[styles.revealAll, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="eye" size={16} color={c.ink} />
              <Text style={[styles.revealAllTxt, { color: c.ink }]}>Mostrar resultado e resumo</Text>
            </Pressable>
          ) : (
            a.dek && a.dek !== a.points?.[0]?.text ? (
              <Text style={[styles.dek, { color: c.inkSoft, fontSize: 18 * s, lineHeight: 26 * s }]}>{a.dek}</Text>
            ) : null
          )}
          <Text style={[styles.meta, { color: c.muted }]}>
            Chess Codex · {new Set(a.coverage.map((x) => x.source)).size === 1 ? "1 fonte" : `${new Set(a.coverage.map((x) => x.source)).size} fontes`} · {a.minutes} min
          </Text>
        </View>

        {game ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.blockLabel, { color: c.whisky }]}>ANÁLISE CHESS CODEX · A PARTIDA QUE DECIDIU</Text>
            {a.game?.ply == null ? <GameStory game={game} /> : null}
            <MiniBoard game={game} ply={a.game?.ply} caption={a.game?.caption} />
          </View>
        ) : null}

        {!hidden ? (
          <>
            {a.bullets?.length ? (
            <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Text style={[styles.blockLabel, { color: c.muted }]}>O QUE ACONTECEU</Text>
              {a.bullets.map((b, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={[styles.bulletNum, { color: c.whisky }]}>{i + 1}</Text>
                  <Text style={[styles.bulletTxt, { color: c.ink, fontSize: 16 * s, lineHeight: 23 * s }]}>{b}</Text>
                </View>
              ))}
            </View>
            ) : null}

            {a.stats ? (
              <View style={styles.stats}>
                {a.stats.map((st) => (
                  <View key={st.label} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                    <Text style={[styles.statVal, { color: c.ink }]}>{st.value}</Text>
                    <Text style={[styles.statLbl, { color: c.muted }]}>{st.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {a.context ? (
              <View style={[styles.context, { borderLeftColor: c.whisky }]}>
                <Text style={[styles.blockLabel, { color: c.whisky }]}>POR QUE IMPORTA</Text>
                <Text style={[styles.contextTxt, { color: c.inkSoft, fontSize: 16 * s, lineHeight: 24 * s }]}>{a.context}</Text>
              </View>
            ) : null}

            {a.points?.length ? (
              <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={[styles.blockLabel, { color: c.muted }]}>FONTES · O QUE CADA UMA PUBLICOU</Text>
                {a.points.map((p) => (
                  <Pressable key={p.url} onPress={() => openExternal(p.url)} style={({ pressed }) => [styles.point, { opacity: pressed ? 0.6 : 1 }]}>
                    <SourceTag id={p.source} publisher={p.publisher} />
                    <Text style={[styles.pointTxt, { color: c.ink, fontSize: 16 * s, lineHeight: 23 * s }]}>{p.text}</Text>
                    <Text style={[styles.readMore, { color: c.accent }]}>Ler na fonte</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {a.points?.length ? null : (
        <View style={{ gap: 4 }}>
          <Text style={[styles.blockLabel, { color: c.muted, marginBottom: 6 }]}>COMO CADA UM COBRIU</Text>
          {a.coverage.map((cv) => (
            <Pressable
              key={cv.url + cv.source}
              onPress={() => openExternal(cv.url)}
              style={({ pressed }) => [styles.cov, { backgroundColor: c.surface, borderColor: c.hairline, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <SourceTag id={cv.source} />
                <Text style={[styles.covTitle, { color: c.ink }]} numberOfLines={2}>{cv.title}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={c.muted} />
            </Pressable>
          ))}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  barRight: { flexDirection: 'row', gap: 20, paddingRight: 6 },
  cover: { height: 210, borderRadius: radius.lg, marginHorizontal: -4 },
  kicker: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1.1 },
  title: { fontFamily: font.black, letterSpacing: -0.8 },
  dek: { fontFamily: font.regular },
  meta: { fontFamily: font.medium, fontSize: 12.5 },
  revealAll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  revealAllTxt: { fontFamily: font.semibold, fontSize: 14 },
  block: { borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  blockLabel: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  bullet: { flexDirection: 'row', gap: 12 },
  bulletNum: { fontFamily: font.black, fontSize: 18, width: 16 },
  bulletTxt: { flex: 1, fontFamily: font.medium },
  point: { gap: 6, paddingTop: 4 },
  pointTxt: { fontFamily: font.medium },
  readMore: { fontFamily: font.semibold, fontSize: 13 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  statVal: { fontFamily: font.black, fontSize: 20, letterSpacing: -0.5 },
  statLbl: { fontFamily: font.medium, fontSize: 11.5 },
  context: { borderLeftWidth: 3, paddingLeft: 14, gap: 6 },
  contextTxt: { fontFamily: font.regular },
  cov: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  covTitle: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
});
