import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MicroArticle } from '@/data/edition';
import { sourceById, type SourceId } from '@/data/sources';
import { track } from '@/lib/analytics';
import { readMinutes, useArticleText, useTranslation, type Category, type Digest } from '@/lib/digest';
import type { FeedItem } from '@/lib/rss';
import { safeKicker, safeOrNull, useSpoilerHidden } from '@/lib/spoiler';
import { useStore } from '@/lib/store';
import { font, radius, usePalette, useScheme } from '@/lib/theme';
import { timeAgo } from '@/lib/time';

const owl = require('../../assets/brand/owl.png');

// desfoque das fotos no Anti-Spoiler: forte o bastante para não ler placar nem legenda na imagem
export const SPOILER_BLUR = 24;

export function openExternal(url: string) {
  // vídeo abre no app do YouTube; o resto no navegador interno
  if (/youtube\.com|youtu\.be/.test(url)) {
    Linking.openURL(url).catch(() => {});
    return;
  }
  WebBrowser.openBrowserAsync(url, { toolbarColor: '#070B14', controlsColor: '#E3A04A' }).catch(() => {});
}

const CATEGORY_LABEL: Record<Category, string> = {
  torneios: 'Torneios',
  jogadores: 'Jogadores',
  ciencia: 'Ciência',
  cultura: 'Cultura',
  plataformas: 'Plataformas',
  polemica: 'Polêmica',
  video: 'Vídeo',
  outro: 'Geral',
};

/** Categoria do item: a da IA quando existe; sem ela, a que a própria fonte sugere. */
export function categoryOf(digest: Digest, item: FeedItem): Category {
  const cat = digest.items[item.id]?.category;
  if (cat) return cat;
  if (sourceById(item.source).kind === 'video') return 'video';
  if (item.source === 'gnews-science') return 'ciencia';
  if (item.source === 'gnews-players') return 'jogadores';
  return 'outro';
}

export function ScreenHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: c.muted }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.largeTitle, { color: c.ink }]}>{title}</Text>
      </View>
      {right ?? (
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Image source={owl} style={styles.avatar} contentFit="cover" />
        </Pressable>
      )}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: c.ink }]}>{children}</Text>
      {action}
    </View>
  );
}

export function SourceTag({ id, time, publisher }: { id: SourceId; time?: string; publisher?: string }) {
  const c = usePalette();
  const s = sourceById(id);
  return (
    <View style={styles.tagRow}>
      {s.kind === 'video' ? <Ionicons name="logo-youtube" size={13} color={s.color} /> : <View style={[styles.dot, { backgroundColor: s.color }]} />}
      <Text style={[styles.tagTxt, { color: c.inkSoft }]} numberOfLines={1}>{publisher ?? s.short}</Text>
      {time ? <Text style={[styles.tagTime, { color: c.muted }]}>· {timeAgo(time)}</Text> : null}
    </View>
  );
}

/**
 * Manchete que respeita o Modo Anti-Spoiler: fica velada até o toque.
 * `flagged` é a marca de spoiler do robô; sem ela, vale ter manchete segura (`safe`).
 */
export function SpoilerTitle({ id, text, safe, flagged, style, lines }: { id: string; text: string; safe?: string; flagged?: boolean; style: object; lines?: number }) {
  const c = usePalette();
  const { reveal } = useStore();
  const hide = useSpoilerHidden(id, text, flagged ?? safe != null);
  if (!hide) return <Text style={style} numberOfLines={lines}>{text}</Text>;
  // manchete "segura" igual à original, ou que ainda conta o resultado, não protege nada: aí vale o véu
  const ok = safeOrNull(safe, text);
  if (ok) return <Text style={style} numberOfLines={lines}>{ok}</Text>;
  return (
    <Pressable onPress={() => reveal(id)} style={[styles.veil, { backgroundColor: c.surfaceAlt }]}>
      <Ionicons name="eye-off" size={14} color={c.muted} />
      <Text style={[styles.veilTxt, { color: c.muted }]}>Resultado oculto · toque para ver</Text>
    </Pressable>
  );
}

export function SaveButton({ id, size = 20 }: { id: string; size?: number }) {
  const c = usePalette();
  const { saved, toggleSaved } = useStore();
  const on = saved.includes(id);
  return (
    <Pressable
      onPress={() => {
        toggleSaved(id);
        track(on ? 'unsave' : 'save', { id });
      }}
      hitSlop={10}
      accessibilityLabel={on ? 'Remover dos salvos' : 'Salvar'}
    >
      <Ionicons name={on ? 'bookmark' : 'bookmark-outline'} size={size} color={on ? c.whisky : c.muted} />
    </Pressable>
  );
}

/** Curtida fica no aparelho e ajuda a ordenar as Notícias do dia pela categoria. */
export function LikeButton({ id, info, size = 20 }: { id: string; info?: { category?: string; title?: string }; size?: number }) {
  const c = usePalette();
  const { liked, toggleLiked } = useStore();
  const on = liked.includes(id);
  return (
    <Pressable
      onPress={() => {
        toggleLiked(id, info);
        // só id e categoria: o título não sai do aparelho
        track(on ? 'unlike' : 'like', info?.category ? { id, category: info.category } : { id });
      }}
      hitSlop={10}
      accessibilityLabel={on ? 'Descurtir' : 'Curtir'}
    >
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? c.whisky : c.muted} />
    </Pressable>
  );
}

/** Compartilha a notícia com o link original da fonte: o crédito fica com quem publicou. */
export function shareItem(title: string, url: string, id?: string) {
  track('share', id ? { id } : {});
  Share.share({ message: `${title}
${url}

via Chess Codex`, url }).catch(() => {});
}

export function ShareButton({ id, title, url, size = 20, color }: { id?: string; title: string; url: string; size?: number; color?: string }) {
  const c = usePalette();
  return (
    <Pressable onPress={() => shareItem(title, url, id)} hitSlop={10} accessibilityLabel="Compartilhar">
      <Ionicons name="share-outline" size={size} color={color ?? c.muted} />
    </Pressable>
  );
}

/** Selo de que a notícia tem texto nosso para ler dentro do app. */
export function ReadBadge({ words, minutes }: { words?: number; minutes?: number }) {
  const c = usePalette();
  // o número vem do JSON remoto: sem valor válido, melhor sem selo do que "NaN min"
  const m = minutes ?? (words != null ? readMinutes(words) : NaN);
  if (!Number.isFinite(m)) return null;
  return (
    <View style={[styles.readBadge, { backgroundColor: c.whiskySoft }]}>
      <Ionicons name="document-text-outline" size={10} color={c.whisky} />
      <Text style={[styles.readBadgeTxt, { color: c.whisky }]}>Leitura {m} min</Text>
    </View>
  );
}

/** Abre a notícia no leitor do app; vídeo segue direto pro YouTube, que é onde ele roda. */
export function openFeedItem(item: FeedItem) {
  if (sourceById(item.source).kind === 'video') openExternal(item.url);
  else router.push({ pathname: '/read/[id]', params: { id: item.id } });
}

/**
 * Linha de notícia com a fonte à mostra. Sem `onPress`, abre a publicação original (Radar);
 * com ele, quem chama decide (Salvos abre o leitor).
 */
export function FeedRow({ item, onPress }: { item: FeedItem; onPress?: (item: FeedItem) => void }) {
  const c = usePalette();
  const { digest } = useStore();
  const tr = useTranslation(item.id);
  const text = useArticleText(item.id);
  const title = tr?.title ?? item.title;
  // resumo da IA só depois de conferido com a fonte; sem isso, o trecho original (o crédito está no topo)
  const excerpt = (tr?.checked && tr.summary) || item.excerpt;
  const flagged = !!digest.items[item.id]?.spoiler;
  // o resumo costuma contar o placar: no Anti-Spoiler some junto com a manchete, e também sozinho
  // quando ele mesmo conta o resultado
  const hidden = useSpoilerHidden(item.id, title, flagged);
  const excerptSpoils = useSpoilerHidden(item.id, excerpt);
  return (
    <Pressable
      onPress={() => (onPress ? onPress(item) : openExternal(item.url))}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.hairline, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.metaRow}>
          <SourceTag id={item.source} time={item.publishedAt} publisher={item.publisher} />
          {/* o selo só faz sentido quando o toque leva ao nosso texto */}
          {onPress && text ? <ReadBadge words={text.words} /> : null}
        </View>
        <SpoilerTitle
          id={item.id}
          text={title}
          safe={flagged && tr ? tr.safeTitle : undefined}
          flagged={flagged}
          style={[styles.rowTitle, { color: c.ink }]}
          lines={3}
        />
        {excerpt && !hidden && !excerptSpoils ? (
          <Text style={[styles.rowExcerpt, { color: c.muted }]} numberOfLines={2}>{excerpt}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        {item.image ? (
          <View>
            {/* a foto também conta o resultado (pódio, troféu, "novo presidente"): desfocada até revelar */}
            <Image source={item.image} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} contentFit="cover" transition={200} blurRadius={hidden ? SPOILER_BLUR : 0} />
            {sourceById(item.source).kind === 'video' ? (
              <View style={styles.play}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.actions}>
          <LikeButton id={item.id} info={{ category: categoryOf(digest, item) }} size={18} />
          <SaveButton id={item.id} size={18} />
          <ShareButton id={item.id} title={title} url={item.url} size={18} />
        </View>
      </View>
    </Pressable>
  );
}

// "via Blogs do Lichess", "via FIDE e ChessBase", "via FIDE, Chess.com +2".
// Veículo do Google Notícias aparece pelo nome real; fonte única ganha o nome completo.
function viaSources(coverage: MicroArticle['coverage'], feed: FeedItem[]): string {
  const ids = [...new Set(coverage.map((x) => x.source))];
  const names = [
    ...new Set(
      ids.map((s) => {
        const publisher = feed.find((i) => i.source === s && coverage.some((x) => x.url === i.url))?.publisher;
        const src = sourceById(s);
        return publisher ?? (ids.length === 1 && src.kind !== 'geral' ? src.name : src.short);
      }),
    ),
  ];
  if (names.length <= 2) return names.join(' e ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

type NewsView = {
  kicker: string;
  title: string;
  flagged: boolean;
  safe?: string;
  summary?: string;
  image?: string;
  via: string;
  time?: string;
  badge?: { words?: number; minutes?: number };
  open: () => void;
};

/**
 * Cartão das Notícias do dia: nosso título, nosso texto e a fonte só no rodapé.
 * Sem botões: o toque abre a leitura (história ou leitor).
 */
export function NewsCard(props: { story: MicroArticle } | { item: FeedItem }) {
  const c = usePalette();
  const { digest, settings, items } = useStore();
  const id = 'story' in props ? props.story.id : props.item.id;
  const tr = useTranslation(id);
  const text = useArticleText(id);

  let v: NewsView;
  if ('story' in props) {
    const a = props.story;
    v = {
      kicker: a.kicker,
      title: a.title,
      flagged: a.spoiler,
      safe: a.spoiler ? a.safeTitle : undefined,
      // sem texto corrido do robô, a linha de apoio já é nossa (ou o resumo da fonte principal)
      summary: a.body?.[0] ?? (a.dek || undefined),
      image: a.image,
      via: viaSources(a.coverage, items),
      time: a.publishedAt || undefined,
      badge: a.body?.length ? { minutes: a.minutes } : undefined,
      open: () => router.push({ pathname: '/story/[id]', params: { id: a.id } }),
    };
  } else {
    const i = props.item;
    const flagged = !!digest.items[i.id]?.spoiler;
    v = {
      kicker: CATEGORY_LABEL[categoryOf(digest, i)],
      title: tr?.title ?? i.title,
      flagged,
      safe: flagged && tr ? tr.safeTitle : undefined,
      // tradução desligada = o leitor pediu o original, então vale o trecho da própria fonte;
      // o resumo curto da IA só entra depois de conferido com a fonte, senão fica o trecho dela
      summary: settings.translate
        ? (text?.paragraphs.find((p) => p.trim()) ?? ((tr?.checked && tr.summary) || i.excerpt || undefined))
        : i.excerpt || undefined,
      image: i.image,
      via: i.publisher ?? sourceById(i.source).name,
      time: i.publishedAt,
      badge: text ? { words: text.words } : undefined,
      open: () => openFeedItem(i),
    };
  }

  const hidden = useSpoilerHidden(id, v.title, v.flagged);
  // resumo e rótulo são conferidos pelo próprio texto: o título pode passar e o resumo contar o placar
  const summarySpoils = useSpoilerHidden(id, v.summary ?? '');
  const kickerSpoils = useSpoilerHidden(id, v.kicker);
  // mesma regra da página da história: sem o detalhe depois do ponto, e a editoria se ainda contar
  const kicker = (hidden || kickerSpoils) && 'story' in props ? safeKicker(v.kicker, props.story.tag) : v.kicker;

  return (
    <Pressable
      onPress={v.open}
      style={({ pressed }) => [styles.news, { backgroundColor: c.surface, borderColor: c.hairline, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.newsMain}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.kicker, { color: c.whisky }]} numberOfLines={1}>{kicker.toUpperCase()}</Text>
          <SpoilerTitle id={id} text={v.title} safe={v.safe} flagged={v.flagged} style={[styles.newsTitle, { color: c.ink }]} lines={3} />
          {/* no Anti-spoiler o resumo some sem aviso por cartão: o chip do topo já diz "Sem spoilers" */}
          {v.summary && !hidden && !summarySpoils ? (
            <Text style={[styles.newsSummary, { color: c.inkSoft }]} numberOfLines={2}>{v.summary}</Text>
          ) : null}
        </View>
        {v.image ? (
          <Image
            source={v.image}
            style={[styles.newsThumb, { backgroundColor: c.surfaceAlt }]}
            contentFit="cover"
            transition={200}
            recyclingKey={id}
            blurRadius={hidden ? SPOILER_BLUR : 0}
          />
        ) : null}
      </View>
      <View style={styles.newsFoot}>
        <Image source={owl} style={styles.newsOwl} contentFit="cover" />
        <Text style={[styles.newsFootTxt, { color: c.muted }]} numberOfLines={1}>
          <Text style={[styles.newsBrand, { color: c.inkSoft }]}>Chess Codex</Text>
          {v.via ? ` · via ${v.via}` : ''}
          {v.time ? ` · ${timeAgo(v.time)}` : ''}
        </Text>
        {v.badge ? <ReadBadge {...v.badge} /> : null}
      </View>
    </Pressable>
  );
}

export function MicroCard({ a, hero }: { a: MicroArticle; hero?: boolean }) {
  const c = usePalette();
  // no tema claro o destaque é papel branco; no escuro, o marinho da coruja
  const scheme = useScheme();
  const navy = hero && scheme === 'dark';
  const hot = new Set(a.coverage.map((x) => x.source)).size >= 3;
  // a linha de apoio conta o resultado tanto quanto a manchete; ela e o rótulo também são
  // conferidos pelo próprio texto
  const hidden = useSpoilerHidden(a.id, a.title, a.spoiler);
  const dekSpoils = useSpoilerHidden(a.id, a.dek);
  const kickerSpoils = useSpoilerHidden(a.id, a.kicker);
  const kicker = hidden || kickerSpoils ? safeKicker(a.kicker, a.tag) : a.kicker;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/story/[id]', params: { id: a.id } })}
      style={({ pressed }) => [
        hero ? styles.hero : styles.card,
        { backgroundColor: navy ? c.brand : c.surface, borderColor: c.hairline, borderWidth: hero && !navy ? StyleSheet.hairlineWidth : undefined, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      {a.image ? (
        <Image
          source={a.image}
          style={[hero ? styles.heroImg : styles.cardImg, { backgroundColor: c.surfaceAlt }]}
          contentFit="cover"
          transition={250}
          recyclingKey={a.id}
          blurRadius={hidden ? SPOILER_BLUR : 0}
        />
      ) : null}
      <View style={styles.cardTop}>
        <Text style={[styles.kicker, { color: navy ? '#F2C27A' : c.whisky, flexShrink: 1 }]} numberOfLines={1}>{kicker.toUpperCase()}</Text>
        {hot ? (
          <View style={[styles.hot, { backgroundColor: navy ? 'rgba(255,255,255,0.14)' : c.whiskySoft }]}>
            <Ionicons name="flame" size={11} color={navy ? '#F2C27A' : c.whisky} />
            <Text style={[styles.hotTxt, { color: navy ? '#F2C27A' : c.whisky }]}>Em alta</Text>
          </View>
        ) : (
          <Text style={[styles.minutes, { color: navy ? 'rgba(255,255,255,0.7)' : c.muted }]}>{a.minutes} min</Text>
        )}
      </View>
      <SpoilerTitle
        id={a.id}
        text={a.title}
        safe={a.spoiler ? a.safeTitle : undefined}
        style={[hero ? styles.heroTitle : styles.cardTitle, { color: navy ? '#FFFFFF' : c.ink }]}
      />
      {hero && a.dek && !hidden && !dekSpoils ? <Text style={[styles.heroDek, { color: navy ? 'rgba(255,255,255,0.82)' : c.inkSoft }]}>{a.dek}</Text> : null}
      <View style={styles.cardFoot}>
        <View style={styles.stack}>
          {[...new Set(a.coverage.map((x) => x.source))].slice(0, 4).map((s, i) => (
            <View key={s} style={[styles.stackDot, { backgroundColor: sourceById(s).color, marginLeft: i ? -5 : 0, borderColor: navy ? c.brand : c.surface }]} />
          ))}
          <Text style={[styles.stackTxt, { color: navy ? 'rgba(255,255,255,0.75)' : c.muted }]}>
            {new Set(a.coverage.map((x) => x.source)).size === 1 ? "1 fonte" : `${new Set(a.coverage.map((x) => x.source)).size} fontes`}
          </Text>
        </View>
        {a.game ? (
          <View style={[styles.pill, { backgroundColor: navy ? 'rgba(255,255,255,0.12)' : c.whiskySoft }]}>
            <Ionicons name="grid" size={11} color={navy ? '#F2C27A' : c.whisky} />
            <Text style={[styles.pillTxt, { color: navy ? '#F2C27A' : c.whisky }]}>Desafio</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Chip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? c.ink : c.surface, borderColor: c.hairline }]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipTxt, { color: active ? c.bg : c.inkSoft }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  eyebrow: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.8, marginBottom: 2 },
  largeTitle: { fontFamily: font.black, fontSize: 34, letterSpacing: -0.9 },
  avatar: { width: 38, height: 38, borderRadius: 11, marginBottom: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 26, marginBottom: 10 },
  section: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // encolhe o nome do veículo antes de empurrar o tempo e o selo pra fora da linha
  tagTxt: { fontFamily: font.semibold, fontSize: 12.5, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  readBadgeTxt: { fontFamily: font.semibold, fontSize: 10.5 },
  tagTime: { fontFamily: font.regular, fontSize: 12.5 },
  veil: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  veilTxt: { fontFamily: font.medium, fontSize: 13.5 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, marginHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: font.semibold, fontSize: 16.5, lineHeight: 22, letterSpacing: -0.2 },
  rowExcerpt: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 14 },
  thumb: { width: 76, height: 76, borderRadius: 12 },
  news: { marginHorizontal: 16, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  newsMain: { flexDirection: 'row', gap: 12 },
  newsTitle: { fontFamily: font.bold, fontSize: 17, lineHeight: 22.5, letterSpacing: -0.3 },
  newsSummary: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  newsThumb: { width: 84, height: 84, borderRadius: 12 },
  newsFoot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newsOwl: { width: 16, height: 16, borderRadius: 5 },
  newsFootTxt: { flex: 1, fontFamily: font.regular, fontSize: 12 },
  newsBrand: { fontFamily: font.semibold },
  hero: { marginHorizontal: 16, borderRadius: radius.xl, padding: 20, paddingTop: 0, gap: 10, overflow: 'hidden' },
  heroImg: { height: 190, marginHorizontal: -20, marginBottom: 6 },
  cardImg: { height: 118, marginHorizontal: -16, marginTop: -16, marginBottom: 4 },
  card: { width: 250, borderRadius: radius.lg, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  kicker: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1 },
  minutes: { fontFamily: font.medium, fontSize: 11.5 },
  heroTitle: { fontFamily: font.black, fontSize: 27, lineHeight: 32, letterSpacing: -0.7 },
  heroDek: { fontFamily: font.regular, fontSize: 15.5, lineHeight: 22 },
  hot: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  hotTxt: { fontFamily: font.bold, fontSize: 11 },
  play: { position: 'absolute', left: 26, top: 26, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: font.bold, fontSize: 17.5, lineHeight: 23, letterSpacing: -0.3 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  stackTxt: { fontFamily: font.medium, fontSize: 12, marginLeft: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillTxt: { fontFamily: font.semibold, fontSize: 11.5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  chipTxt: { fontFamily: font.semibold, fontSize: 13.5 },
});
