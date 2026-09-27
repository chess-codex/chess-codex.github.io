import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop, SvgXml } from 'react-native-svg';

import { PIECES } from '@/components/pieces';
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

// ícone da fonte na linha do crédito: YouTube e redes sociais; o resto usa a bolinha com a cor dela
function sourceIcon(id: SourceId): keyof typeof Ionicons.glyphMap | null {
  const s = sourceById(id);
  if (s.kind === 'video') return 'logo-youtube';
  if (s.kind === 'social') return s.feed.includes('mastodon') ? 'logo-mastodon' : 'at-circle';
  return null;
}

export function SourceTag({ id, time, publisher }: { id: SourceId; time?: string; publisher?: string }) {
  const c = usePalette();
  const s = sourceById(id);
  const icon = sourceIcon(id);
  return (
    <View style={styles.tagRow}>
      {icon ? <Ionicons name={icon} size={13} color={s.color} /> : <View style={[styles.dot, { backgroundColor: s.color }]} />}
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

// cores dos botões de ação: `color` apagado, `activeColor` ligado (curtido, salvo).
// Sem elas, as do tema; o destaque marinho passa as suas
type ActionColors = { color?: string; activeColor?: string };

export function SaveButton({ id, size = 20, color, activeColor }: { id: string; size?: number } & ActionColors) {
  const c = usePalette();
  const { saved, toggleSaved } = useStore();
  const on = saved.includes(id);
  return (
    <Pressable
      onPress={(e) => {
        // dentro de um cartão, o toque fica no botão e não abre a notícia
        e.stopPropagation();
        toggleSaved(id);
        track(on ? 'unsave' : 'save', { id });
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Remover dos salvos' : 'Salvar'}
    >
      <Ionicons name={on ? 'bookmark' : 'bookmark-outline'} size={size} color={on ? (activeColor ?? c.whisky) : (color ?? c.muted)} />
    </Pressable>
  );
}

/** Curtida fica no aparelho e ajuda a ordenar as Notícias do dia pela categoria. */
export function LikeButton({ id, info, size = 20, color, activeColor }: { id: string; info?: { category?: string; title?: string }; size?: number } & ActionColors) {
  const c = usePalette();
  const { liked, toggleLiked } = useStore();
  const on = liked.includes(id);
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        toggleLiked(id, info);
        // só id e categoria: o título não sai do aparelho
        track(on ? 'unlike' : 'like', info?.category ? { id, category: info.category } : { id });
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Descurtir' : 'Curtir'}
    >
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? (activeColor ?? c.whisky) : (color ?? c.muted)} />
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
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        shareItem(title, url, id);
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Compartilhar"
    >
      <Ionicons name="share-outline" size={size} color={color ?? c.muted} />
    </Pressable>
  );
}

/**
 * Manchete que vai no compartilhamento. A folha de compartilhar mostra o texto na tela:
 * com a notícia velada pelo Anti-spoiler, vai a manchete segura (ou o rótulo), não o placar.
 */
function shareTitle(hidden: boolean, title: string, safe: string | undefined, kicker: string): string {
  return hidden ? (safeOrNull(safe, title) ?? kicker) : title;
}

/**
 * Curtir, salvar e compartilhar no rodapé dos cartões do Hoje. Cada botão tem hitSlop e segura
 * o próprio toque: tocar no resto do cartão continua abrindo a notícia.
 * Sem link da fonte, fica sem o compartilhar.
 */
function CardActions({ id, info, title, url, color, activeColor }: { id: string; info: { category?: string; title?: string }; title: string; url?: string } & ActionColors) {
  return (
    <View style={[styles.actions, styles.cardActions]}>
      <LikeButton id={id} info={info} size={18} color={color} activeColor={activeColor} />
      <SaveButton id={id} size={18} color={color} activeColor={activeColor} />
      {url ? <ShareButton id={id} title={title} url={url} size={18} color={color} /> : null}
    </View>
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

// o cavalo das peças do tabuleiro (Cburnett) em whisky, com o contorno no marinho escuro
const ART_KNIGHT = PIECES.wN.replace(/#fff/g, '#E3A04A').replace(/#000/g, '#152036');
// casas claras de um tabuleiro 4×4, bem apagadas, como textura do fundo
const ART_SQUARES = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].filter((f) => (r + f) % 2 === 0).map((f) => ({ r, f })));

/**
 * Arte de reserva para notícia sem foto: o marinho da coruja em degradê, o cavalo em whisky
 * e o nome curto da fonte. A mesma nos dois temas, porque o marinho contrasta com os dois fundos.
 */
export function CoverArt({ label, color, size }: { label: string; color?: string; size: number }) {
  return (
    <View
      style={[styles.art, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 4 4" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ccCoverArt" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#34507E" />
            <Stop offset="1" stopColor="#1B2A45" />
          </LinearGradient>
        </Defs>
        <Rect width="4" height="4" fill="url(#ccCoverArt)" />
        {ART_SQUARES.map(({ r, f }) => (
          <Rect key={`${r}${f}`} x={f} y={r} width="1" height="1" fill="#FFFFFF" opacity={0.045} />
        ))}
      </Svg>
      {/* na View: no navegador, o SVG solto ficaria por baixo do fundo, que é posicionado */}
      <View style={{ marginTop: -size * 0.12 }}>
        <SvgXml xml={ART_KNIGHT} width={size * 0.5} height={size * 0.5} />
      </View>
      <View style={styles.artFoot}>
        {color ? <View style={[styles.artDot, { backgroundColor: color }]} /> : null}
        <Text style={styles.artLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** Foto da notícia; sem foto, ou quando ela não carrega (link quebrado, bloqueio), a arte de reserva. */
function Thumb({ uri, size, label, color, blur, recyclingKey }: { uri?: string; size: number; label: string; color?: string; blur?: boolean; recyclingKey?: string }) {
  const c = usePalette();
  // guarda qual endereço falhou: na lista reciclada o mesmo componente recebe outra foto depois
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) return <CoverArt label={label} color={color} size={size} />;
  return (
    <Image
      source={uri}
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: c.surfaceAlt }}
      contentFit="cover"
      transition={200}
      recyclingKey={recyclingKey}
      blurRadius={blur ? SPOILER_BLUR : 0}
      onError={() => setFailed(uri)}
    />
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
  const src = sourceById(item.source);
  const title = tr?.title ?? item.title;
  // resumo da IA só depois de conferido com a fonte; sem isso, o trecho original (o crédito está no topo)
  const excerpt = tr?.summary || item.excerpt;
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
        <View>
          {/* a foto também conta o resultado (pódio, troféu, "novo presidente"): desfocada até revelar */}
          <Thumb
            uri={item.image}
            size={76}
            label={item.publisher ?? src.short}
            color={src.color}
            blur={hidden}
            recyclingKey={item.id}
          />
          {src.kind === 'video' && item.image ? (
            <View style={styles.play}>
              <Ionicons name="play" size={16} color="#fff" />
            </View>
          ) : null}
        </View>
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
  // nome curto e cor da fonte, para a arte de reserva quando não há foto
  art: { label: string; color?: string };
  via: string;
  time?: string;
  badge?: { words?: number; minutes?: number };
  // categoria da curtida (ordena as Notícias do dia) e link que vai no compartilhamento
  category: string;
  url?: string;
  open: () => void;
};

/**
 * Cartão das Notícias do dia: nosso título, nosso texto e a fonte só no rodapé.
 * O toque abre a leitura (história ou leitor); à direita do rodapé, curtir, salvar e compartilhar.
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
    const first = a.coverage[0]?.source;
    v = {
      kicker: a.kicker,
      title: a.title,
      flagged: a.spoiler,
      safe: a.spoiler ? a.safeTitle : undefined,
      // sem texto corrido do robô, a linha de apoio já é nossa (ou o resumo da fonte principal)
      summary: a.body?.[0] ?? (a.dek || undefined),
      image: a.image,
      art: first ? { label: sourceById(first).short, color: sourceById(first).color } : { label: 'Chess Codex' },
      via: viaSources(a.coverage, items),
      time: a.publishedAt || undefined,
      badge: a.body?.length ? { minutes: a.minutes } : undefined,
      // mesma curtida e mesmo link da página da história: a editoria e a primeira fonte
      category: a.tag.toLowerCase(),
      url: a.coverage[0]?.url ?? a.points?.[0]?.url,
      open: () => router.push({ pathname: '/story/[id]', params: { id: a.id } }),
    };
  } else {
    const i = props.item;
    const flagged = !!digest.items[i.id]?.spoiler;
    const category = categoryOf(digest, i);
    v = {
      kicker: CATEGORY_LABEL[category],
      title: tr?.title ?? i.title,
      flagged,
      safe: flagged && tr ? tr.safeTitle : undefined,
      // tradução desligada = o leitor pediu o original, então vale o trecho da própria fonte.
      // Resumo curto em PT (tradução de título + começo da matéria) aparece já; se a conferência
      // reprovar, o robô troca o texto dele pelo título traduzido
      summary: settings.translate
        ? (text?.paragraphs.find((p) => p.trim()) ?? (tr?.summary || i.excerpt || undefined))
        : i.excerpt || undefined,
      image: i.image,
      // Google Notícias vem sem foto: a arte leva o nome do veículo original
      art: { label: i.publisher ?? sourceById(i.source).short, color: sourceById(i.source).color },
      via: i.publisher ?? sourceById(i.source).name,
      time: i.publishedAt,
      badge: text ? { words: text.words } : undefined,
      category,
      // o link original: o crédito fica com quem publicou
      url: i.url,
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
        <Thumb uri={v.image} size={84} label={v.art.label} color={v.art.color} blur={hidden} recyclingKey={id} />
      </View>
      <View style={styles.newsFoot}>
        <Image source={owl} style={styles.newsOwl} contentFit="cover" />
        {/* com os botões ao lado, o crédito pode ir a duas linhas em vez de cortar a fonte */}
        <Text style={[styles.newsFootTxt, { color: c.muted }]} numberOfLines={2}>
          <Text style={[styles.newsBrand, { color: c.inkSoft }]}>Chess Codex</Text>
          {v.via ? ` · via ${v.via}` : ''}
          {v.time ? ` · ${timeAgo(v.time)}` : ''}
        </Text>
        {v.badge ? <ReadBadge {...v.badge} /> : null}
        <CardActions
          id={id}
          info={{ category: v.category, title: v.title }}
          title={shareTitle(hidden, v.title, v.safe, kicker)}
          url={v.url}
        />
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
        // destaque sem foto: sem o respiro de cima, o rótulo colava na borda
        hero && !a.image ? { paddingTop: 20 } : null,
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
        <View style={[styles.stack, { flexShrink: 1 }]}>
          {[...new Set(a.coverage.map((x) => x.source))].slice(0, 4).map((s, i) => (
            <View key={s} style={[styles.stackDot, { backgroundColor: sourceById(s).color, marginLeft: i ? -5 : 0, borderColor: navy ? c.brand : c.surface }]} />
          ))}
          <Text style={[styles.stackTxt, { color: navy ? 'rgba(255,255,255,0.75)' : c.muted, flexShrink: 1 }]} numberOfLines={1}>
            {new Set(a.coverage.map((x) => x.source)).size === 1 ? "1 fonte" : `${new Set(a.coverage.map((x) => x.source)).size} fontes`}
          </Text>
        </View>
        <View style={styles.footRight}>
          {a.game ? (
            <View style={[styles.pill, { backgroundColor: navy ? 'rgba(255,255,255,0.12)' : c.whiskySoft }]}>
              <Ionicons name="grid" size={11} color={navy ? '#F2C27A' : c.whisky} />
              <Text style={[styles.pillTxt, { color: navy ? '#F2C27A' : c.whisky }]}>Desafio</Text>
            </View>
          ) : null}
          {/* só nos destaques do Hoje; no marinho, o branco apagado e o âmbar do rótulo */}
          {hero ? (
            <CardActions
              id={a.id}
              info={{ category: a.tag.toLowerCase(), title: a.title }}
              title={shareTitle(hidden, a.title, a.spoiler ? a.safeTitle : undefined, kicker)}
              url={a.coverage[0]?.url ?? a.points?.[0]?.url}
              color={navy ? 'rgba(255,255,255,0.75)' : undefined}
              activeColor={navy ? '#F2C27A' : undefined}
            />
          ) : null}
        </View>
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
  // um respiro a mais entre o selo de leitura e os botões
  cardActions: { alignItems: 'center', marginLeft: 4 },
  art: { borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  artFoot: { position: 'absolute', left: 5, right: 5, bottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  artDot: { width: 6, height: 6, borderRadius: 3 },
  artLabel: { flexShrink: 1, fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 0.2, color: 'rgba(255,255,255,0.88)' },
  news: { marginHorizontal: 16, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  newsMain: { flexDirection: 'row', gap: 12 },
  newsTitle: { fontFamily: font.bold, fontSize: 17, lineHeight: 22.5, letterSpacing: -0.3 },
  newsSummary: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
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
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  stackTxt: { fontFamily: font.medium, fontSize: 12, marginLeft: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillTxt: { fontFamily: font.semibold, fontSize: 11.5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  chipTxt: { fontFamily: font.semibold, fontSize: 13.5 },
});
