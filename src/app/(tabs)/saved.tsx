import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedRow, MicroCard, ScreenHeader } from '@/components/ui';
import { useArticles } from '@/lib/digest';
import { useStore } from '@/lib/store';
import { font, usePalette } from '@/lib/theme';

export default function Saved() {
  const c = usePalette();
  const { saved, items } = useStore();
  const articles = useArticles().filter((a) => saved.includes(a.id));
  const feed = saved.map((id) => items.find((i) => i.id === id)).filter((i) => i != null);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      <ScreenHeader eyebrow="Pra ler depois" title="Salvos" />
      {!articles.length && !feed.length ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={40} color={c.muted} />
          <Text style={[styles.emptyTitle, { color: c.ink }]}>Nada salvo ainda</Text>
          <Text style={[styles.emptyTxt, { color: c.muted }]}>Toque no marcador de uma notícia para guardá-la aqui. Fica só no seu aparelho.</Text>
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        {articles.map((a) => (
          <View key={a.id} style={{ width: '100%' }}>
            <MicroCard a={a} />
          </View>
        ))}
      </View>
      {feed.map((i) => <FeedRow key={i.id} item={i} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: font.bold, fontSize: 18 },
  emptyTxt: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
