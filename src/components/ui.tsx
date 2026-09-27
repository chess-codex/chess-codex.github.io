import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MicroArticle } from '@/data/edition';
import { sourceById, type SourceId } from '@/data/sources';
import { useTranslation } from '@/lib/digest';
import type { FeedItem } from '@/lib/rss';
import { looksLikeSpoiler } from '@/lib/spoiler';
import { useStore } from '@/lib/store';
import { font, radius, usePalette, useScheme } from '@/lib/theme';
import { timeAgo } from '@/lib/time';

const owl = require('../../assets/brand/owl.png');

export function openExternal(url: string) {
  // vídeo abre no app do YouTube; o resto no navegador interno
  if (/youtube\.com|youtu\.be/.test(url)) {
    Linking.openURL(url).catch(() => {});
    return;
  }
  WebBrowser.openBrowserAsync(url, { toolbarColor: '#070B14', controlsColor: '#E3A04A' }).catch(() => {});
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

/** Manchete que respeita o Modo Anti-Spoiler: fica velada até o toque. */
export function SpoilerTitle({ id, text, safe, style, lines }: { id: string; text: string; safe?: string; style: object; lines?: number }) {
  const c = usePalette();
  const { settings, revealed, reveal } = useStore();
  const hide = settings.antiSpoiler && !revealed.has(id) && (safe != null || looksLikeSpoiler(text));
  if (!hide) return <Text style={style} numberOfLines={lines}>{text}</Text>;
  if (safe) return <Text style={style} numberOfLines={lines}>{safe}</Text>;
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
    <Pressable onPress={() => toggleSaved(id)} hitSlop={10} accessibilityLabel={on ? 'Remover dos salvos' : 'Salvar'}>
      <Ionicons name={on ? 'bookmark' : 'bookmark-outline'} size={size} color={on ? c.whisky : c.muted} />
    </Pressable>
  );
}

/** Compartilha a notícia com o link original da fonte: o crédito fica com quem publicou. */
export function shareItem(title: string, url: string) {
  Share.share({ message: `${title}
${url}

via Chess Codex`, url }).catch(() => {});
}

export function ShareButton({ title, url, size = 20 }: { title: string; url: string; size?: number }) {
  const c = usePalette();
  return (
    <Pressable onPress={() => shareItem(title, url)} hitSlop={10} accessibilityLabel="Compartilhar">
      <Ionicons name="share-outline" size={size} color={c.muted} />
    </Pressable>
  );
}

export function FeedRow({ item }: { item: FeedItem }) {
  const c = usePalette();
  const tr = useTranslation(item.id);
  const title = tr?.title ?? item.title;
  const excerpt = tr?.summary ?? item.excerpt;
  return (
    <Pressable
      onPress={() => openExternal(item.url)}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.hairline, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <SourceTag id={item.source} time={item.publishedAt} publisher={item.publisher} />
        <SpoilerTitle id={item.id} text={title} safe={tr?.spoiler ? tr.safeTitle : undefined} style={[styles.rowTitle, { color: c.ink }]} lines={3} />
        {excerpt ? (
          <Text style={[styles.rowExcerpt, { color: c.muted }]} numberOfLines={2}>{excerpt}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        {item.image ? (
          <View>
            <Image source={item.image} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} contentFit="cover" transition={200} />
            {sourceById(item.source).kind === 'video' ? (
              <View style={styles.play}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.actions}>
          <ShareButton title={title} url={item.url} size={18} />
          <SaveButton id={item.id} size={18} />
        </View>
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
        />
      ) : null}
      <View style={styles.cardTop}>
        <Text style={[styles.kicker, { color: navy ? '#F2C27A' : c.whisky, flexShrink: 1 }]} numberOfLines={1}>{a.kicker.toUpperCase()}</Text>
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
      {hero && a.dek ? <Text style={[styles.heroDek, { color: navy ? 'rgba(255,255,255,0.82)' : c.inkSoft }]}>{a.dek}</Text> : null}
      <View style={styles.cardFoot}>
        <View style={styles.stack}>
          {[...new Set(a.coverage.map((x) => x.source))].slice(0, 4).map((s, i) => (
            <View key={s} style={[styles.stackDot, { backgroundColor: sourceById(s).color, marginLeft: i ? -5 : 0, borderColor: navy ? c.brand : c.surface }]} />
          ))}
          <Text style={[styles.stackTxt, { color: navy ? 'rgba(255,255,255,0.75)' : c.muted }]}>
            {new Set(a.coverage.map((x) => x.source)).size} fontes
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
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tagTxt: { fontFamily: font.semibold, fontSize: 12.5 },
  tagTime: { fontFamily: font.regular, fontSize: 12.5 },
  veil: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  veilTxt: { fontFamily: font.medium, fontSize: 13.5 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, marginHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: font.semibold, fontSize: 16.5, lineHeight: 22, letterSpacing: -0.2 },
  rowExcerpt: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 16 },
  thumb: { width: 76, height: 76, borderRadius: 12 },
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
