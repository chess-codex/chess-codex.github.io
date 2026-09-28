import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { GameCard } from '@/components/GameCard';
import { MicroCard, NewsCard, ScreenHeader, SectionTitle } from '@/components/ui';
import type { MicroArticle } from '@/data/edition';
import { useGames } from '@/lib/games';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';
import { longDate, timeAgo } from '@/lib/time';
import { useToday } from '@/lib/today';

// Hoje é a nossa edição: destaque, Notícias do dia com texto nosso e as partidas.
// A lista de fontes cruas mora no Radar.

// o carrossel passa sozinho a cada 5 s e para por 12 s quando o leitor mexe
const AUTO_EVERY = 5_000;
const AUTO_PAUSE = 12_000;

export default function Today() {
  const c = usePalette();
  const { refreshing, refresh, settings, setSettings, updatedAt } = useStore();
  const { highlights, news } = useToday();
  const games = useGames().slice(0, 12);
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  // largura real do carrossel: na web a coluna tem teto (760), menor que a janela
  const [slideW, setSlideW] = useState(0);
  const slide = slideW || width;
  const carousel = useRef<FlatList<MicroArticle>>(null);
  // passa sozinho para a direita; depois que o leitor mexe, espera um pouco antes de voltar a passar
  const pausedUntil = useRef(0);
  const pauseAuto = useCallback(() => {
    pausedUntil.current = Date.now() + AUTO_PAUSE;
  }, []);
  const goTo = useCallback(
    (i: number, byUser = false) => {
      if (byUser) pauseAuto();
      carousel.current?.scrollToOffset({ offset: i * slide, animated: true });
      setPage(i);
    },
    [slide, pauseAuto],
  );
  useEffect(() => {
    if (highlights.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      goTo((page + 1) % highlights.length);
    }, AUTO_EVERY);
    return () => clearInterval(t);
  }, [page, highlights.length, goTo]);


  const hour = new Date().getHours();
  const label = hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Noite';
  const count = highlights.length + news.length;
  const ago = timeAgo(updatedAt);
  const updated = ago === 'agora' ? 'atualizado agora' : ago === 'ontem' ? 'atualizado ontem' : `atualizado há ${ago}`;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.whisky} colors={[c.whisky]} />}
    >
      <ScreenHeader eyebrow={longDate()} title="Chess Codex" />

      {/* Linha da edição: quando, quanto e o atalho do Anti-spoiler */}
      <View style={styles.edition}>
        <Ionicons name={label === 'Noite' ? 'moon' : label === 'Manhã' ? 'sunny' : 'partly-sunny'} size={13} color={c.whisky} />
        <Text style={[styles.editionTxt, { color: c.muted }]} numberOfLines={2}>
          <Text style={[styles.editionLabel, { color: c.whisky }]}>Edição da {label}</Text>
          {` · ${count} ${count === 1 ? 'notícia' : 'notícias'} · ${updated}`}
        </Text>
        <Pressable
          onPress={() => setSettings({ antiSpoiler: !settings.antiSpoiler })}
          style={[styles.spoilerToggle, { backgroundColor: settings.antiSpoiler ? c.ink : c.surfaceAlt }]}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.antiSpoiler }}
          accessibilityLabel="Modo Anti-spoiler"
        >
          <Ionicons name={settings.antiSpoiler ? 'eye-off' : 'eye'} size={13} color={settings.antiSpoiler ? c.bg : c.inkSoft} />
          <Text style={[styles.spoilerTxt, { color: settings.antiSpoiler ? c.bg : c.inkSoft }]}>
            {settings.antiSpoiler ? 'Sem spoilers' : 'Anti-spoiler'}
          </Text>
        </Pressable>
      </View>

      {/* Destaques: as histórias mais importantes do dia, uma por vez, passando para o lado */}
      {highlights.length ? (
        <>
          <FlatList
            ref={carousel}
            horizontal
            pagingEnabled
            data={highlights}
            keyExtractor={(a) => a.id}
            onLayout={(e) => setSlideW(e.nativeEvent.layout.width)}
            renderItem={({ item }) => (
              <View style={{ width: slide }}>
                <MicroCard a={item} hero />
              </View>
            )}
            // onScroll e não onMomentumScrollEnd: na web o fim do "momentum" não dispara
            onScroll={(e) => {
              const p = Math.round(e.nativeEvent.contentOffset.x / slide);
              if (p !== page) setPage(p);
            }}
            scrollEventThrottle={32}
            onScrollBeginDrag={pauseAuto}
            onTouchStart={pauseAuto}
            showsHorizontalScrollIndicator={false}
          />
          {highlights.length > 1 ? (
            <View style={styles.dots} accessibilityLabel={`Destaque ${page + 1} de ${highlights.length}`}>
              {highlights.map((a, i) => (
                <Pressable
                  key={a.id}
                  onPress={() => goTo(i, true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir para o destaque ${i + 1}`}
                >
                  <View style={[styles.dot, { backgroundColor: i === page ? c.whisky : c.hairline, width: i === page ? 18 : 7 }]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {games.length ? (
        <>
          <SectionTitle>Partidas do dia</SectionTitle>
          <FlatList
            horizontal
            data={games}
            keyExtractor={(g) => g.key}
            renderItem={({ item }) => <GameCard game={item} />}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            showsHorizontalScrollIndicator={false}
          />
        </>
      ) : null}

      {news.length ? (
        <>
          <SectionTitle>Notícias do dia</SectionTitle>
          <View style={styles.list}>
            {news.map((e) =>
              'story' in e ? <NewsCard key={e.story.id} story={e.story} /> : <NewsCard key={e.item.id} item={e.item} />,
            )}
          </View>
        </>
      ) : null}

      {/* edições dos dias anteriores, guardadas pelo robô no próprio site */}
      <Pressable onPress={() => router.push('/arquivo')} style={[styles.archive, { borderColor: c.hairline }]} accessibilityRole="button">
        <Ionicons name="albums-outline" size={18} color={c.whisky} />
        <Text style={[styles.archiveTxt, { color: c.ink }]}>Edições anteriores</Text>
        <Ionicons name="chevron-forward" size={16} color={c.muted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  archive: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 24, padding: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  archiveTxt: { flex: 1, fontFamily: font.semibold, fontSize: 15 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { height: 7, borderRadius: 4 },
  edition: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, marginTop: -4, marginBottom: 14 },
  editionTxt: { flex: 1, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  editionLabel: { fontFamily: font.semibold },
  spoilerToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  spoilerTxt: { fontFamily: font.semibold, fontSize: 12 },
  list: { gap: 10 },
});
