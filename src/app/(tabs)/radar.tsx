import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, FeedRow, ScreenHeader } from '@/components/ui';
import { sourceById, type SourceId } from '@/data/sources';
import type { Category } from '@/lib/digest';
import type { FeedItem } from '@/lib/rss';
import { useStore, useVisibleItems } from '@/lib/store';
import { font, usePalette } from '@/lib/theme';

// Radar = tudo sobre xadrez fora das redações: vida dos jogadores, ciência, cultura,
// vídeos, polêmicas e o que a comunidade está discutindo.
type Filter = 'tudo' | 'regiao' | 'jogadores' | 'ciencia' | 'video' | 'comunidade' | 'polemica';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'video', label: 'Vídeos' },
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

  const match = useCallback(
    (i: FeedItem) => {
      const kind = sourceById(i.source).kind;
      if (kind === 'jornal') return false;
      const tr = digest.items[i.id];
      if (tr && !tr.relevant) return false;
      if (filter === 'regiao') return i.source === 'gnews-local';
      if (filter === 'tudo') return true;
      if (filter === 'comunidade') return kind === 'comunidade';
      if (filter === 'video') return kind === 'video';
      const cat = tr?.category ?? fallbackCategory(i.source);
      if (filter === 'ciencia') return cat === 'ciencia' || cat === 'cultura';
      return cat === filter;
    },
    [digest, filter],
  );
  const items = useVisibleItems(match);

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
          Imprensa geral, YouTube, r/chess e blogs do Lichess. Cada item leva à publicação original.
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
