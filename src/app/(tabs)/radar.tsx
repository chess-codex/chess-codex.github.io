import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, FeedRow, ScreenHeader } from '@/components/ui';
import { mentions } from '@/data/players';
import { sourceById, type SourceId } from '@/data/sources';
import { usePlayers, type Category } from '@/lib/digest';
import type { FeedItem } from '@/lib/rss';
import { useStore, useVisibleItems } from '@/lib/store';
import { font, usePalette } from '@/lib/theme';
import { sameFact, similar, titleWords } from '@/lib/titles';
import { useToday } from '@/lib/today';

// Radar = tudo sobre xadrez fora das redações: vida dos jogadores, ciência, cultura,
// vídeos, redes sociais, polêmicas e o que a comunidade está discutindo.
type Filter = 'tudo' | 'brasil' | 'top10' | 'regiao' | 'jogadores' | 'ciencia' | 'video' | 'redes' | 'comunidade' | 'polemica';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'brasil', label: 'Brasil' },
  { id: 'top10', label: 'Top 10 FIDE' },
  { id: 'video', label: 'Vídeos' },
  { id: 'redes', label: 'Redes' },
  { id: 'jogadores', label: 'Jogadores' },
  { id: 'polemica', label: 'Polêmicas' },
  { id: 'ciencia', label: 'Curiosidades' },
  { id: 'comunidade', label: 'Comunidade' },
];

// Sem a IA, a categoria sai da própria fonte
function fallbackCategory(source: SourceId): Category | 'comunidade' {
  const kind = sourceById(source).kind;
  if (kind === 'video') return 'video';
  if (kind === 'comunidade') return 'comunidade';
  if (source === 'gnews-science') return 'ciencia';
  if (source === 'gnews-players') return 'jogadores';
  return 'outro';
}

export default function Radar() {
  const c = usePalette();
  const { refreshing, refresh, digest, settings } = useStore();
  const [filter, setFilter] = useState<Filter>('tudo');
  const players = usePlayers();
  const top10 = useMemo(() => players.filter((p) => p.list === 'open'), [players]);
  // o que já está no Hoje (pelo link ou pela mesma manchete em outra fonte) não se repete aqui
  const { highlights, news } = useToday();
  const inToday = useMemo(() => {
    const stories = [...highlights, ...news.flatMap((e) => ('story' in e ? [e.story] : []))];
    const urls = new Set([...stories.flatMap((a) => a.coverage.map((x) => x.url)), ...news.flatMap((e) => ('item' in e ? [e.item.url] : []))]);
    const words = [
      ...stories.map((a) => titleWords(a.title)),
      ...news.flatMap((e) => ('item' in e ? [titleWords(digest.items[e.item.id]?.title ?? e.item.title)] : [])),
    ];
    return (i: FeedItem) => urls.has(i.url) || words.some((w) => sameFact(w, titleWords(digest.items[i.id]?.title ?? i.title)));
  }, [highlights, news, digest]);

  const match = useCallback(
    (i: FeedItem) => {
      const kind = sourceById(i.source).kind;
      const tr = digest.items[i.id];
      if (tr && !tr.relevant) return false;
      if (inToday(i)) return false;
      // Top 10 FIDE: tudo que cita alguém do top 10, de qualquer fonte (inclusive redações)
      // Brasil: tudo o que vem de fonte em português, redações brasileiras incluídas
      if (filter === 'brasil') return sourceById(i.source).lang === 'pt' && i.source !== 'gnews-local';
      if (filter === 'top10') return mentions(`${i.title} ${i.excerpt} ${tr?.title ?? ''}`, top10).length > 0;
      if (kind === 'jornal') return false;
      if (filter === 'regiao') return i.source === 'gnews-local';
      if (filter === 'tudo') return true;
      if (filter === 'comunidade') return kind === 'comunidade';
      if (filter === 'video') return kind === 'video';
      if (filter === 'redes') return kind === 'social';
      const cat = tr?.category ?? fallbackCategory(i.source);
      if (filter === 'ciencia') return cat === 'ciencia' || cat === 'cultura';
      return cat === filter;
    },
    [digest, filter, top10, inToday],
  );
  const found = useVisibleItems(match);
  // o mesmo fato em várias fontes vira um item só (o mais novo; a lista já vem do mais novo)
  const items = useMemo(() => {
    const seen: Set<string>[] = [];
    return found.filter((i) => {
      const w = titleWords(digest.items[i.id]?.title ?? i.title);
      // entre itens do Radar, só manchete quase igual: "China vence" e "Uzbequistão vence" ficam os dois
      if (seen.some((x) => similar(x, w))) return false;
      seen.push(w);
      return true;
    });
  }, [found, digest]);

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <FeedRow item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.whisky} colors={[c.whisky]} />}
      ListHeaderComponent={
        <View>
          <ScreenHeader eyebrow="Tudo sobre xadrez" title="Radar" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {settings.region ? (
              <Chip label={settings.region} color="#F59E0B" active={filter === 'regiao'} onPress={() => setFilter('regiao')} />
            ) : null}
            {FILTERS.map((f) => (
              <Chip key={f.id} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={<Text style={[styles.empty, { color: c.muted }]}>Nada por aqui agora. Puxe para atualizar.</Text>}
      ListFooterComponent={
        <Text style={[styles.note, { color: c.muted }]}>
          Imprensa geral, YouTube, perfis no Bluesky e no Mastodon e blogs de xadrez. O que já está no Hoje não se repete aqui. Cada item leva à publicação original.
        </Text>
      }
      contentContainerStyle={{ paddingBottom: 32 }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 6 },
  empty: { fontFamily: font.regular, fontSize: 14, textAlign: 'center', paddingTop: 40 },
  note: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 32, paddingTop: 20 },
});
