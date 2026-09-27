import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedRow, MicroCard, ScreenHeader, SectionTitle } from '@/components/ui';
import { EDITION } from '@/data/edition';
import { mentions } from '@/data/players';
import { GameCard } from '@/components/GameCard';
import { useArticles, usePlayers } from '@/lib/digest';
import { useGames } from '@/lib/games';
import { sourceById } from '@/data/sources';
import type { FeedItem } from '@/lib/rss';
import { useStore, useVisibleItems } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';
import { longDate } from '@/lib/time';

export default function Today() {
  const c = usePalette();
  const { refreshing, refresh, settings, setSettings, digest } = useStore();
  const articles = useArticles();
  const games = useGames().slice(0, 12);
  const hour = new Date().getHours();
  const label = hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Noite';
  const intro = digest.stories.length ? articles.slice(0, 3).map((a) => a.title).join(' · ') : EDITION.intro;
  const journal = useCallback((i: FeedItem) => sourceById(i.source).kind === 'jornal', []);
  const latest = useVisibleItems(journal).slice(0, 6);
  // sem escolha do leitor, acompanha o Top 10 FIDE inteiro
  const players = usePlayers();
  const tracked = settings.following.length
    ? players.filter((p) => settings.following.includes(p.id))
    : players.filter((p) => p.list === 'open');
  const followed = useCallback((i: FeedItem) => mentions(`${i.title} ${i.excerpt}`, tracked).length > 0, [tracked]);
  const mine = useVisibleItems(followed).slice(0, 5);
  const [lead, ...rest] = articles;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.whisky} colors={[c.whisky]} />}
    >
      <ScreenHeader eyebrow={longDate()} title="Chess Codex" />

      {/* Edição: o resumo curto do dia, estilo Gazeta */}
      <View style={[styles.edition, { backgroundColor: c.surface, borderColor: c.hairline }]}>
        <View style={styles.editionTop}>
          <View style={[styles.editionBadge, { backgroundColor: c.whiskySoft }]}>
            <Ionicons name={label === 'Noite' ? 'moon' : label === 'Manhã' ? 'sunny' : 'partly-sunny'} size={12} color={c.whisky} />
            <Text style={[styles.editionBadgeTxt, { color: c.whisky }]}>Edição da {label}</Text>
          </View>
          <Pressable
            onPress={() => setSettings({ antiSpoiler: !settings.antiSpoiler })}
            style={[styles.spoilerToggle, { backgroundColor: settings.antiSpoiler ? c.ink : c.surfaceAlt }]}
            hitSlop={6}
          >
            <Ionicons name={settings.antiSpoiler ? 'eye-off' : 'eye'} size={13} color={settings.antiSpoiler ? c.bg : c.inkSoft} />
            <Text style={[styles.spoilerTxt, { color: settings.antiSpoiler ? c.bg : c.inkSoft }]}>
              {settings.antiSpoiler ? 'Sem spoilers' : 'Anti-spoiler'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.editionIntro, { color: c.ink }]}>
          {settings.antiSpoiler ? 'Resumo pronto, resultados escondidos. Toque numa manchete para revelar.' : intro}
        </Text>
        <Text style={[styles.editionMeta, { color: c.muted }]}>
          {articles.length} histórias · {articles.reduce((s, a) => s + a.minutes, 0)} min de leitura
        </Text>
      </View>

      <View style={{ height: 14 }} />
      <MicroCard a={lead} hero />

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

      <SectionTitle>Em 1 minuto</SectionTitle>
      <FlatList
        horizontal
        data={rest}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <MicroCard a={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        showsHorizontalScrollIndicator={false}
      />

      {mine.length ? (
        <>
          <SectionTitle
            action={
              <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
                <Text style={[styles.more, { color: c.accent }]}>{settings.following.length ? 'Editar' : 'Escolher'}</Text>
              </Pressable>
            }
          >
            {settings.following.length ? 'Seus jogadores' : 'Top 10 FIDE'}
          </SectionTitle>
          {mine.map((i) => <FeedRow key={i.id} item={i} />)}
        </>
      ) : null}

      <SectionTitle
        action={
          <Pressable onPress={() => router.push('/feed')} hitSlop={8}>
            <Text style={[styles.more, { color: c.accent }]}>Ver tudo</Text>
          </Pressable>
        }
      >
        Últimas das redações
      </SectionTitle>
      {latest.map((i) => <FeedRow key={i.id} item={i} />)}

      <Text style={[styles.footer, { color: c.muted }]}>
        Chess.com, Lichess, FIDE e ChessBase na mesma página.{'\n'}Sem conta, sem anúncios, tudo salvo no seu aparelho.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  edition: { marginHorizontal: 16, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  editionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editionBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  editionBadgeTxt: { fontFamily: font.bold, fontSize: 12 },
  spoilerToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  spoilerTxt: { fontFamily: font.semibold, fontSize: 12 },
  editionIntro: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  editionMeta: { fontFamily: font.regular, fontSize: 12.5 },
  more: { fontFamily: font.semibold, fontSize: 15 },
  footer: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 28, paddingHorizontal: 32 },
});
