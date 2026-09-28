import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { GameCard } from '@/components/GameCard';
import { MicroCard, NewsCard, ScreenHeader, SectionTitle, categoryOf } from '@/components/ui';
import type { MicroArticle } from '@/data/edition';
import { mentions } from '@/data/players';
import { SOURCES, sourceById } from '@/data/sources';
import { useArticles, usePlayers } from '@/lib/digest';
import { useGames } from '@/lib/games';
import type { FeedItem } from '@/lib/rss';
import { categoryKey, useStore, useVisibleItems } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';
import { longDate, timeAgo } from '@/lib/time';

// Hoje é a nossa edição: destaque, Notícias do dia com texto nosso e as partidas.
// A lista de fontes cruas mora no Radar.

// teto de cartões nas Notícias do dia, somando histórias e itens soltos
const MAX_NEWS = 20;
// destaques no carrossel do topo: variedade sem voltar a encher a tela
const HIGHLIGHTS = 3;
const HOUR = 3_600_000;
// bônus pequenos, medidos em horas de frescor: sobem a notícia sem enterrar a que acabou de sair
const FOLLOW_BONUS = 6 * HOUR;
const LIKE_BONUS = 3 * HOUR; // por curtida na mesma categoria, contando até 2

// manchetes quase iguais de fontes diferentes contam como repetição
const titleKey = (s: string) => categoryKey(s).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 48);
// palavras que identificam a manchete: 4 letras ou mais, e números ("Rodada 9" e "Rodada 10" diferem)
const titleWords = (s: string) => new Set(categoryKey(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 || /^\d+$/.test(w)));
// mesma notícia com tradução diferente: sobreposição de palavras (Jaccard) de 0,6 ou mais
function similar(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common) >= 0.6;
}
// o Google Notícias põe o veículo no fim do título ("... – International Chess Federation")
const originalTitle = (i: FeedItem) => (i.source.startsWith('gnews') ? i.title.replace(/\s[-–—]\s[^-–—]+$/, '') : i.title);

// Redações de xadrez pelo nome. Pelo Google Notícias elas repetem o que o feed direto já traz.
// "Chess News | ChessBase" é a ChessBase; "ChessBase India" é outro veículo.
const JORNAL_NAMES = new Set(SOURCES.filter((s) => s.kind === 'jornal').map((s) => categoryKey(s.name)));
const fromJornal = (publisher?: string) => !!publisher && publisher.split(/\s[|–-]\s/).some((p) => JORNAL_NAMES.has(categoryKey(p)));

type Entry = { story: MicroArticle } | { item: FeedItem };

export default function Today() {
  const c = usePalette();
  const { refreshing, refresh, settings, setSettings, digest, liked, likedCategories, updatedAt } = useStore();
  const articles = useArticles();
  const games = useGames().slice(0, 12);
  const players = usePlayers();
  const muted = useMemo(() => settings.mutedWords.map((w) => w.toLowerCase()).filter(Boolean), [settings.mutedWords]);
  // histórias também respeitam fontes ocultas e palavras silenciadas, como os itens soltos:
  // some a história que só tem fontes ocultas ou que cita palavra silenciada
  const visible = useMemo(
    () =>
      articles.filter(
        (a) =>
          (!a.coverage.length || a.coverage.some((x) => !settings.hiddenSources.includes(x.source))) &&
          !muted.some((w) => `${a.title} ${a.dek}`.toLowerCase().includes(w)),
      ),
    [articles, settings.hiddenSources, muted],
  );
  const highlights = visible.slice(0, HIGHLIGHTS);
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  // item que já está numa história não volta solto na lista
  const inStory = useMemo(() => {
    const ids = new Set(digest.stories.flatMap((s) => s.itemIds));
    const urls = new Set(articles.flatMap((a) => a.coverage.map((x) => x.url)));
    return (i: FeedItem) => ids.has(i.id) || urls.has(i.url);
  }, [digest, articles]);

  const candidate = useCallback(
    (i: FeedItem) => {
      const kind = sourceById(i.source).kind;
      const tr = digest.items[i.id];
      // só o que o robô já traduziu e achou relevante: é o que tem título e texto nossos.
      // Redação vista pelo Google Notícias fica de fora: o feed direto dela já traz a matéria
      if (kind === 'geral' && fromJornal(i.publisher)) return false;
      // a gazeta só publica notícia com texto nosso: sem resumo em PT, ela fica só no Radar
      const hasText = !!digest.articles?.[i.id]?.paragraphs?.length || !!tr?.summary?.trim();
      return (kind === 'jornal' || kind === 'geral') && !!tr && tr.relevant !== false && hasText && !inStory(i);
    },
    [digest, inStory],
  );
  const pool = useVisibleItems(candidate);

  // Curtir no próprio cartão não embaralha a lista enquanto se lê: a curtida entra na ordem
  // quando chega edição nova ou quando se volta para a aba, não no toque
  const [likeSnap, setLikeSnap] = useState({ liked, likedCategories, updatedAt, digest });
  if (likeSnap.updatedAt !== updatedAt || likeSnap.digest !== digest) {
    setLikeSnap({ liked, likedCategories, updatedAt, digest });
  }
  const latestLikes = useRef({ liked, likedCategories });
  useEffect(() => {
    latestLikes.current = { liked, likedCategories };
  }, [liked, likedCategories]);
  useFocusEffect(useCallback(() => setLikeSnap((s) => ({ ...s, ...latestLikes.current })), []));

  const news = useMemo<Entry[]>(() => {
    // sem escolha do leitor, o Top 10 FIDE inteiro ganha o bônus
    const tracked = settings.following.length
      ? players.filter((p) => settings.following.includes(p.id))
      : players.filter((p) => p.list === 'open');
    // curtidas por categoria; curtida sem categoria guardada usa a do robô ou a editoria da história
    const likes = new Map<string, number>();
    for (const id of likeSnap.liked) {
      const cat = likeSnap.likedCategories[id] ?? digest.items[id]?.category ?? articles.find((a) => a.id === id)?.tag;
      if (cat) likes.set(categoryKey(cat), (likes.get(categoryKey(cat)) ?? 0) + 1);
    }
    const ranked = pool
      .map((i) => {
        const pt = digest.items[i.id]?.title ?? i.title;
        const follow = mentions(`${i.title} ${i.excerpt} ${pt}`, tracked).length > 0;
        const cat = Math.min(2, likes.get(categoryOf(digest, i)) ?? 0);
        const score = (Date.parse(i.publishedAt) || 0) + (follow ? FOLLOW_BONUS : 0) + cat * LIKE_BONUS;
        return { i, pt, score };
      })
      // palavra silenciada vale também para a manchete traduzida
      .filter(({ pt }) => !muted.some((w) => pt.toLowerCase().includes(w)))
      .sort((a, b) => b.score - a.score);

    // histórias primeiro, na ordem do robô; os destaques já estão lá em cima
    const out: Entry[] = visible.slice(HIGHLIGHTS, HIGHLIGHTS + MAX_NEWS).map((a) => ({ story: a }));
    // repetição pela manchete traduzida e pela original: o mesmo comunicado vindo de dois feeds
    // pode ganhar traduções diferentes, mas o título original é o mesmo
    const seenKeys = new Set(visible.map((a) => titleKey(a.title)));
    const seenWords = visible.map((a) => titleWords(a.title));
    for (const { i, pt } of ranked) {
      if (out.length >= MAX_NEWS) break;
      const keys = [titleKey(pt), titleKey(originalTitle(i))].filter(Boolean);
      const sets = [titleWords(pt), titleWords(originalTitle(i))];
      if (keys.some((k) => seenKeys.has(k)) || sets.some((s) => seenWords.some((w) => similar(s, w)))) continue;
      keys.forEach((k) => seenKeys.add(k));
      seenWords.push(...sets);
      out.push({ item: i });
    }
    return out;
  }, [pool, articles, visible, muted, players, settings.following, likeSnap, digest]);

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
            horizontal
            pagingEnabled
            data={highlights}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => (
              <View style={{ width }}>
                <MicroCard a={item} hero />
              </View>
            )}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            showsHorizontalScrollIndicator={false}
          />
          {highlights.length > 1 ? (
            <View style={styles.dots} accessibilityLabel={`Destaque ${page + 1} de ${highlights.length}`}>
              {highlights.map((a, i) => (
                <View key={a.id} style={[styles.dot, { backgroundColor: i === page ? c.whisky : c.hairline, width: i === page ? 18 : 7 }]} />
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
