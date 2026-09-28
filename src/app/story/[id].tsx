import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameStory, MiniBoard } from '@/components/MiniBoard';
import { LikeButton, SPOILER_BLUR, SaveButton, ShareButton, SourceTag, openExternal } from '@/components/ui';
import type { MicroArticle } from '@/data/edition';
import { sourceById, type SourceId } from '@/data/sources';
import { track } from '@/lib/analytics';
import { useArticles } from '@/lib/digest';
import { useGame } from '@/lib/games';
import { gameRevealId, safeKicker, safeOrNull, useSpoilerHidden } from '@/lib/spoiler';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';

// o robô marca com checked os resumos por fonte que passaram pela conferência
type Point = NonNullable<MicroArticle['points']>[number];
type SourceEntry = { key: string; source: SourceId; publisher?: string; url: string; label: string; text?: string };

/** "Chess.com, FIDE e Lichess" */
const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : (names[0] ?? 'as fontes');

export default function Story() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, items, digest, reveal } = useStore();
  const found = useArticles().find((x) => x.id === id);
  // guarda o que abriu: a atualização do digest pode renumerar as histórias no meio da leitura
  const [first] = useState(found);
  const a = found ?? first;
  const game = useGame(a?.game?.key);
  const hidden = useSpoilerHidden(a?.id ?? '', a?.title ?? '', a?.spoiler);
  const [open, setOpen] = useState(false);

  const openedId = a?.id;
  const openedSource = a?.coverage[0]?.source ?? 'chesscodex';
  useEffect(() => {
    if (openedId) track('news_open', { id: openedId, kind: 'story', source: openedSource });
  }, [openedId, openedSource]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!a) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg, paddingTop: insets.top + 40 }]}>
        <Ionicons name="newspaper-outline" size={40} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.ink }]}>História não encontrada</Text>
        <Text style={[styles.emptyTxt, { color: c.muted }]}>Ela pode ter saído da edição desde a última atualização.</Text>
        <Pressable onPress={back} hitSlop={10}>
          <Text style={[styles.link, { color: c.accent }]}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  const s = settings.textScale;
  const byUrl = new Map([...digest.feed, ...items].map((i) => [i.url, i]));

  // Crédito de cada fonte, sempre com link. Texto só com rótulo honesto: resumo conferido
  // é "o que a fonte publicou"; sem conferência, fica só a manchete da fonte, traduzida.
  const fromPoints: SourceEntry[] = (a.points ?? []).map((p: Point) =>
    p.checked
      ? { key: p.url, source: p.source, publisher: p.publisher, url: p.url, label: 'O que a fonte publicou', text: p.text }
      : { key: p.url, source: p.source, publisher: p.publisher, url: p.url, label: 'Manchete da fonte', text: a.coverage.find((cv) => cv.url === p.url)?.title },
  );
  // fonte da cobertura sem resumo próprio também leva crédito
  const fromCoverage: SourceEntry[] = a.coverage
    .filter((cv) => !fromPoints.some((e) => e.url === cv.url))
    .map((cv) => ({ key: cv.url + cv.source, source: cv.source, publisher: byUrl.get(cv.url)?.publisher, url: cv.url, label: 'Manchete da fonte', text: cv.title }));
  const sources = [...fromPoints, ...fromCoverage];
  const names = [...new Set(sources.map((e) => e.publisher ?? sourceById(e.source).name))];
  const listOpen = hidden || open;
  // Sem o texto corrido do robô, o "O que aconteceu" sai dos resumos curtos em PT de cada fonte
  // (já prontos no digest), com o nome de quem publicou: a página nunca fica só com links
  // sem texto corrido da história, vale o texto completo (já conferido) de uma das matérias dela
  const articleBody = a.body?.length
    ? null
    : (a.coverage.map((cv) => byUrl.get(cv.url)?.id).map((id) => (id ? digest.articles?.[id] : undefined)).find((t) => t?.paragraphs?.some((p) => p.trim())) ?? null);
  const body = a.body?.length ? a.body : (articleBody?.paragraphs.filter((p) => p.trim()) ?? []);
  const recap = body.length
    ? []
    : [...new Map((a.points ?? []).filter((p) => p.text?.trim() && p.text !== a.dek).map((p) => [p.text, p])).values()].slice(0, 4);

  // manchete segura do robô; igual à original ou ainda contando o resultado, vira aviso
  const safeTitle = a.spoiler ? safeOrNull(a.safeTitle, a.title) : null;
  // o detalhe depois do ponto às vezes traz o placar ("Olimpíada · Índia 2,5 × 1,5 Alemanha"):
  // a mesma regra dos cartões. Com a página aberta e sem véu, o texto todo já está à mostra
  const kicker = hidden ? safeKicker(a.kicker, a.tag) : a.kicker;

  // a foto vem de uma das fontes: o crédito diz de qual
  const photoItem = a.image ? [...digest.feed, ...items].find((i) => i.image === a.image) : undefined;
  const photoBy = photoItem ? (photoItem.publisher ?? sourceById(photoItem.source).name) : a.image?.match(/^https?:\/\/(?:www\.)?([^/]+)/)?.[1];

  // revelar em qualquer ponto da página revela tudo: manchete, texto, tabuleiro e relato
  const revealStory = () => reveal(a.id);
  const revealAll = () => {
    reveal(a.id);
    if (a.game) reveal(gameRevealId(a.game.key));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: c.bg, borderBottomColor: c.hairline }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Hoje</Text>
        </Pressable>
        <View style={styles.barRight}>
          <LikeButton id={a.id} info={{ category: a.tag.toLowerCase(), title: a.title }} size={22} />
          <SaveButton id={a.id} size={22} />
          <ShareButton id={a.id} title={a.title} url={a.coverage[0]?.url ?? sources[0]?.url ?? ''} size={22} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        {a.image ? (
          <View style={{ gap: 6 }}>
            {/* a foto também pode contar o resultado: desfocada até revelar */}
            <Image source={a.image} style={[styles.cover, { backgroundColor: c.surfaceAlt }]} contentFit="cover" contentPosition="top" transition={250} blurRadius={hidden ? SPOILER_BLUR : 0} />
            {photoBy ? <Text style={[styles.photoBy, { color: c.muted }]}>Foto: {photoBy}</Text> : null}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={[styles.kicker, { color: c.whisky }]}>{kicker.toUpperCase()}</Text>
          {!hidden ? (
            <Text style={[styles.title, { color: c.ink, fontSize: 30 * s, lineHeight: 35 * s }]}>{a.title}</Text>
          ) : safeTitle ? (
            <Text style={[styles.title, { color: c.ink, fontSize: 30 * s, lineHeight: 35 * s }]}>{safeTitle}</Text>
          ) : (
            <View style={[styles.veil, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="eye-off" size={14} color={c.muted} />
              <Text style={[styles.veilTxt, { color: c.muted }]}>Manchete oculta: ela conta o resultado</Text>
            </View>
          )}
          {hidden ? (
            <Pressable onPress={revealAll} style={[styles.revealAll, { backgroundColor: c.surfaceAlt }]} accessibilityRole="button">
              <Ionicons name="eye" size={16} color={c.ink} />
              <Text style={[styles.revealAllTxt, { color: c.ink }]}>Mostrar resultado e resumo</Text>
            </Pressable>
          ) : a.dek && !a.points?.some((p) => p.text === a.dek) ? (
            <Text style={[styles.dek, { color: c.inkSoft, fontSize: 18 * s, lineHeight: 26 * s }]}>{a.dek}</Text>
          ) : null}
          <Text style={[styles.meta, { color: c.muted }]}>
            Chess Codex · {new Set(a.coverage.map((x) => x.source)).size === 1 ? '1 fonte' : `${new Set(a.coverage.map((x) => x.source)).size} fontes`} · {a.minutes} min
          </Text>
        </View>

        {!hidden ? (
          <>
            {/* texto corrido do robô substitui os tópicos: os dois contariam a mesma coisa */}
            {body.length ? (
              <View style={{ gap: 12 }}>
                <Text style={[styles.blockLabel, { color: c.muted }]}>O QUE ACONTECEU</Text>
                {body.map((p, i) => (
                  <Text key={i} style={[styles.bodyTxt, { color: c.ink, fontSize: 17 * s, lineHeight: 26 * s }]}>{p}</Text>
                ))}
              </View>
            ) : recap.length ? (
              <View style={{ gap: 12 }}>
                <Text style={[styles.blockLabel, { color: c.muted }]}>O QUE ACONTECEU</Text>
                {recap.map((p) => (
                  <Text key={p.url} style={[styles.bodyTxt, { color: c.ink, fontSize: 17 * s, lineHeight: 26 * s }]}>
                    <Text style={{ fontFamily: font.semibold }}>{p.publisher ?? sourceById(p.source).name}: </Text>
                    {p.text}
                  </Text>
                ))}
              </View>
            ) : a.bullets?.length ? (
              <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={[styles.blockLabel, { color: c.muted }]}>O QUE ACONTECEU</Text>
                {a.bullets.map((b, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text style={[styles.bulletNum, { color: c.whisky }]}>{i + 1}</Text>
                    <Text style={[styles.bulletTxt, { color: c.ink, fontSize: 16 * s, lineHeight: 23 * s }]}>{b}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {a.stats ? (
              <View style={styles.stats}>
                {a.stats.map((st) => (
                  <View key={st.label} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                    <Text style={[styles.statVal, { color: c.ink }]}>{st.value}</Text>
                    <Text style={[styles.statLbl, { color: c.muted }]}>{st.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {a.context ? (
              <View style={[styles.context, { borderLeftColor: c.whisky }]}>
                <Text style={[styles.blockLabel, { color: c.whisky }]}>POR QUE IMPORTA</Text>
                <Text style={[styles.contextTxt, { color: c.inkSoft, fontSize: 16 * s, lineHeight: 24 * s }]}>{a.context}</Text>
              </View>
            ) : null}

            {/* só o texto corrido é do robô; a edição de exemplo foi escrita à mão */}
            {body.length ? (
              <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>
                Resumo automático do Chess Codex, conferido frase a frase com {articleBody?.source ?? joinNames(names)}. Em caso de dúvida, vale o original.
              </Text>
            ) : recap.length ? (
              <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>
                Resumos automáticos do Chess Codex a partir de cada fonte. As matérias completas estão nos links abaixo.
              </Text>
            ) : null}
          </>
        ) : null}

        {/* no Anti-Spoiler o relato e o tabuleiro trocam o vencedor por um aviso neutro */}
        {game ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.blockLabel, { color: c.whisky }]}>ANÁLISE CHESS CODEX · A PARTIDA QUE DECIDIU</Text>
            {a.game?.ply == null ? <GameStory game={game} onReveal={revealStory} /> : null}
            <MiniBoard game={game} ply={a.game?.ply} caption={a.game?.caption} onReveal={revealStory} />
          </View>
        ) : null}

        {/* crédito e link das fontes nunca somem, nem no Anti-Spoiler (aí sem o texto, que pode ter o resultado) */}
        {sources.length ? (
          <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <Pressable
              onPress={() => setOpen((v) => !v)}
              disabled={hidden}
              accessibilityRole="button"
              accessibilityState={{ expanded: listOpen }}
              style={styles.sourcesHead}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.blockLabel, { color: c.muted }]}>FONTES ({sources.length})</Text>
                {listOpen ? null : (
                  <Text style={[styles.sourcesNames, { color: c.inkSoft }]} numberOfLines={2}>{joinNames(names)}</Text>
                )}
              </View>
              {hidden ? null : <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />}
            </Pressable>
            {listOpen
              ? sources.map((e) => (
                  <Pressable
                    key={e.key}
                    onPress={() => openExternal(e.url)}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.point, { borderTopColor: c.hairline, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <SourceTag id={e.source} publisher={e.publisher} />
                    {!hidden && e.text ? (
                      <>
                        <Text style={[styles.pointLabel, { color: c.muted }]}>{e.label}</Text>
                        <Text style={[styles.pointTxt, { color: c.ink, fontSize: 15 * s, lineHeight: 22 * s }]}>{e.text}</Text>
                      </>
                    ) : null}
                    <Text style={[styles.readMore, { color: c.accent }]}>Ler na fonte</Text>
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingRight: 6 },
  cover: { aspectRatio: 16 / 9, borderRadius: radius.lg, marginHorizontal: -4 },
  photoBy: { fontFamily: font.regular, fontSize: 11.5, textAlign: 'right' },
  kicker: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1.1 },
  title: { fontFamily: font.black, letterSpacing: -0.8 },
  veil: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  veilTxt: { fontFamily: font.medium, fontSize: 13.5, flexShrink: 1 },
  dek: { fontFamily: font.regular },
  meta: { fontFamily: font.medium, fontSize: 12.5 },
  revealAll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  revealAllTxt: { fontFamily: font.semibold, fontSize: 14 },
  block: { borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  blockLabel: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  bullet: { flexDirection: 'row', gap: 12 },
  bulletNum: { fontFamily: font.black, fontSize: 18, width: 16 },
  bulletTxt: { flex: 1, fontFamily: font.medium },
  bodyTxt: { fontFamily: font.regular },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  sourcesHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourcesNames: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  point: { gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  pointLabel: { fontFamily: font.semibold, fontSize: 11.5 },
  pointTxt: { fontFamily: font.medium },
  readMore: { fontFamily: font.semibold, fontSize: 13 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  statVal: { fontFamily: font.black, fontSize: 20, letterSpacing: -0.5 },
  statLbl: { fontFamily: font.medium, fontSize: 11.5 },
  context: { borderLeftWidth: 3, paddingLeft: 14, gap: 6 },
  contextTxt: { fontFamily: font.regular },
  empty: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: font.bold, fontSize: 18 },
  emptyTxt: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  link: { fontFamily: font.semibold, fontSize: 15, marginTop: 8 },
});
