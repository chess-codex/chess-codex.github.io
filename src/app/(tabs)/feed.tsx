import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, FeedRow, ScreenHeader } from '@/components/ui';
import { SOURCES, type SourceId } from '@/data/sources';
import type { FeedItem } from '@/lib/rss';
import { useStore, useVisibleItems } from '@/lib/store';
import { font, usePalette } from '@/lib/theme';
import { timeAgo } from '@/lib/time';

const JOURNALS = SOURCES.filter((s) => s.kind === 'jornal');

export default function Feed() {
  const c = usePalette();
  const { refreshing, refresh, updatedAt, errors } = useStore();
  const [only, setOnly] = useState<SourceId | null>(null);
  const filter = useCallback(
    (i: FeedItem) => (only ? i.source === only : JOURNALS.some((s) => s.id === i.source)),
    [only],
  );
  const items = useVisibleItems(filter);

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <FeedRow item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.whisky} colors={[c.whisky]} />}
      ListHeaderComponent={
        <View>
          <ScreenHeader eyebrow={`Atualizado há ${timeAgo(updatedAt)}`} title="Agora" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Todas" active={!only} onPress={() => setOnly(null)} />
            {JOURNALS.map((s) => (
              <Chip key={s.id} label={s.short} color={s.color} active={only === s.id} onPress={() => setOnly(only === s.id ? null : s.id)} />
            ))}
          </ScrollView>
          {errors.length ? (
            <Text style={[styles.warn, { color: c.muted }]}>Sem conexão com: {errors.join(', ')}. Mostrando o que já estava salvo.</Text>
          ) : null}
        </View>
      }
      contentContainerStyle={{ paddingBottom: 32 }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 6 },
  warn: { fontFamily: font.regular, fontSize: 12.5, paddingHorizontal: 20, paddingTop: 8 },
});
