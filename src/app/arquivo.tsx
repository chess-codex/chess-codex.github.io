import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openExternal } from '@/components/ui';
import { ARQUIVO_URL } from '@/data/config';
import { font, radius, usePalette } from '@/lib/theme';
import { longDate } from '@/lib/time';

// Formato de arquivo.json (gerado pelo robô em scripts/archive.mjs)
type Entry = { title: string; text?: string; summary?: string; kicker?: string; url: string; source: string; image: string | null };
type GameEntry = { white: string; black: string; result: string; round: string; event: string; url: string };
type Day = { date: string; stories: Entry[]; news: Entry[]; games: GameEntry[] };

/** Edições anteriores: um resumo de cada dia, com link para a fonte original. */
export default function Arquivo() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(ARQUIVO_URL, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { days?: Day[] }) => {
        if (!alive) return;
        // a edição de hoje já está no Hoje: o arquivo mostra os dias anteriores
        const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
        setDays((d.days ?? []).filter((x) => x.date < today));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, borderBottomColor: c.hairline }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Hoje</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 12 }}>
        <Text style={[styles.h1, { color: c.ink }]}>Edições anteriores</Text>
        <Text style={[styles.lead, { color: c.muted }]}>Um resumo de cada dia, com o link da matéria original.</Text>

        {days == null && !failed ? <ActivityIndicator color={c.whisky} style={{ marginTop: 30 }} /> : null}
        {failed ? <Text style={[styles.lead, { color: c.muted }]}>Não foi possível carregar o arquivo agora. Tente de novo mais tarde.</Text> : null}
        {days?.length === 0 ? (
          <Text style={[styles.lead, { color: c.muted }]}>O arquivo começa a se formar a partir de amanhã, com a edição de hoje.</Text>
        ) : null}

        {days?.map((d) => {
          const isOpen = open === d.date;
          return (
            <View key={d.date} style={[styles.day, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Pressable onPress={() => setOpen(isOpen ? null : d.date)} style={styles.dayHead} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dayTitle, { color: c.ink }]}>{longDate(new Date(`${d.date}T12:00:00`))}</Text>
                  <Text style={[styles.dayMeta, { color: c.muted }]} numberOfLines={1}>
                    {d.stories[0]?.title ?? `${d.news.length} notícias`}
                  </Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
              </Pressable>
              {isOpen ? (
                <View style={{ gap: 14, paddingTop: 6 }}>
                  {[...d.stories, ...d.news].map((e, n) => (
                    <Pressable key={`${e.url}-${n}`} onPress={() => e.url && openExternal(e.url)} style={styles.row}>
                      {e.image ? <Image source={e.image} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} contentFit="cover" /> : null}
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.rowTitle, { color: c.ink }]} numberOfLines={3}>{e.title}</Text>
                        {e.text || e.summary ? (
                          <Text style={[styles.rowText, { color: c.inkSoft }]} numberOfLines={3}>{e.text || e.summary}</Text>
                        ) : null}
                        <Text style={[styles.rowSrc, { color: c.muted }]}>via {e.source}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {d.games.length ? (
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.label, { color: c.whisky }]}>PARTIDAS DO DIA</Text>
                      {d.games.map((g) => (
                        <Pressable key={g.url || `${g.white}-${g.black}`} onPress={() => g.url && openExternal(g.url)}>
                          <Text style={[styles.rowText, { color: c.inkSoft }]}>
                            {g.white} × {g.black} · {g.result.replace('1/2-1/2', '½–½')} · {g.round}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  h1: { fontFamily: font.black, fontSize: 28, letterSpacing: -0.6 },
  lead: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  day: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayTitle: { fontFamily: font.bold, fontSize: 16, textTransform: 'capitalize' },
  dayMeta: { fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  rowTitle: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  rowText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  rowSrc: { fontFamily: font.medium, fontSize: 12 },
  label: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
});
