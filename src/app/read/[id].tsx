import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LikeButton, ReadBadge, SPOILER_BLUR, SaveButton, ShareButton, SourceTag, openExternal } from '@/components/ui';
import { sourceById } from '@/data/sources';
import { track } from '@/lib/analytics';
import { useArticleText, useTranslation } from '@/lib/digest';
import { safeOrNull, useSpoilerHidden } from '@/lib/spoiler';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';

const countWords = (texts: string[]) => texts.join(' ').split(/\s+/).filter(Boolean).length;

// Leitor de uma notícia do feed: título em PT, nosso resumo e o caminho pra matéria original.
// O texto é sempre um resumo; a matéria inteira e o crédito continuam na fonte.
export default function Read() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, digest, settings, reveal } = useStore();
  const tr = useTranslation(id);
  const freshText = useArticleText(id);
  // deep link ou item que já saiu da lista baixada: o feed do robô é a reserva
  const found = items.find((i) => i.id === id) ?? digest.feed.find((i) => i.id === id);
  // guarda o que abriu: a atualização do feed pode trocar a lista no meio da leitura
  const [first] = useState(found);
  const [firstText] = useState(freshText);
  const item = found ?? first;
  const text = freshText ?? firstText;
  const robot = digest.items[id];
  const title = tr?.title ?? item?.title ?? '';
  // a marca do robô vale com ou sem tradução ligada; a regra é a mesma da manchete na lista
  const hidden = useSpoilerHidden(id, title, robot?.spoiler);

  const openedId = item?.id;
  const openedSource = item?.source;
  useEffect(() => {
    if (openedId && openedSource) track('news_open', { id: openedId, kind: 'item', source: openedSource });
  }, [openedId, openedSource]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!item) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg, paddingTop: insets.top + 40 }]}>
        <Ionicons name="newspaper-outline" size={40} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.ink }]}>Notícia não encontrada</Text>
        <Text style={[styles.emptyTxt, { color: c.muted }]}>Ela pode ter saído do feed desde a última atualização.</Text>
        <Pressable onPress={back} hitSlop={10}>
          <Text style={[styles.link, { color: c.accent }]}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  const s = settings.textScale;
  const src = sourceById(item.source);
  const fonte = item.publisher ?? src.name;
  const paragraphs = text?.paragraphs.filter((p) => p.trim()) ?? [];
  // o campo vem do JSON remoto: sem número válido, conta aqui
  const words = text && Number.isFinite(text.words) ? text.words : countWords(paragraphs);
  // a mesma manchete segura da lista; igual à original ou ainda contando o resultado, vira aviso
  const safe = robot?.spoiler ? safeOrNull(robot.safeTitle, robot.title) : null;
  // resumo curto da IA só depois de conferido com a fonte; sem isso, vale o trecho da própria fonte
  // resumo curto em PT já aparece; se a conferência reprovar, o robô troca pelo título traduzido
  const shortSummary = tr?.summary ?? '';
  const titleStyle = [styles.title, { color: c.ink, fontSize: 27 * s, lineHeight: 33 * s }];
  const paraStyle = [styles.para, { color: c.ink, fontSize: 17 * s, lineHeight: 26 * s }];
  const cta =
    src.kind === 'video' ? `Assistir em ${fonte}`
    : src.kind === 'social' ? `Ver o post em ${fonte}`
    : `Ler a matéria completa em ${fonte}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: c.bg, borderBottomColor: c.hairline }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Voltar</Text>
        </Pressable>
        <View style={styles.barRight}>
          <LikeButton id={item.id} info={{ category: robot?.category, title }} size={22} />
          <SaveButton id={item.id} size={22} />
          <ShareButton id={item.id} title={title} url={item.url} size={22} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        <View style={{ gap: 10 }}>
          <View style={styles.metaRow}>
            <SourceTag id={item.source} time={item.publishedAt} publisher={item.publisher} />
            {paragraphs.length ? <ReadBadge words={words} /> : null}
          </View>
          {/* no Anti-Spoiler o único controle de revelar é o botão abaixo: manchete e texto juntos */}
          {!hidden ? (
            <Text style={titleStyle}>{title}</Text>
          ) : safe ? (
            <Text style={titleStyle}>{safe}</Text>
          ) : (
            <View style={[styles.veil, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="eye-off" size={14} color={c.muted} />
              <Text style={[styles.veilTxt, { color: c.muted }]}>Manchete oculta: ela conta o resultado</Text>
            </View>
          )}
        </View>

        {item.image ? (
          // a foto também pode contar o resultado: desfocada até revelar
          <Image source={item.image} style={[styles.cover, { backgroundColor: c.surfaceAlt }]} contentFit="cover" contentPosition="top" transition={250} blurRadius={hidden ? SPOILER_BLUR : 0} />
        ) : null}

        {hidden ? (
          <Pressable onPress={() => reveal(item.id)} accessibilityRole="button" style={[styles.revealAll, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="eye" size={16} color={c.ink} />
            <Text style={[styles.revealAllTxt, { color: c.ink }]}>Mostrar resultado e texto</Text>
          </Pressable>
        ) : paragraphs.length ? (
          <View style={{ gap: 14 }}>
            {paragraphs.map((p, i) => (
              <Text key={i} style={paraStyle}>{p}</Text>
            ))}
            <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>
              Resumo automático do Chess Codex, conferido frase a frase com {fonte}. Em caso de dúvida, vale o original.
            </Text>
          </View>
        ) : shortSummary ? (
          <View style={{ gap: 14 }}>
            <Text style={paraStyle}>{shortSummary}</Text>
            <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>Resumo curto. A matéria completa está na fonte.</Text>
          </View>
        ) : item.excerpt ? (
          // trecho literal da fonte: entre aspas e com o nome de quem publicou, não como texto nosso
          <View style={{ gap: 14 }}>
            <Text style={[paraStyle, { color: c.inkSoft }]}>“{item.excerpt}”</Text>
            <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>
              Trecho publicado por {fonte}. A matéria completa está na fonte.
            </Text>
          </View>
        ) : (
          <Text style={[styles.note, { color: c.muted, borderTopColor: c.hairline }]}>A matéria completa está na fonte.</Text>
        )}

        <Pressable
          onPress={() => openExternal(item.url)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.ctaTxt}>{cta}</Text>
          <Ionicons name="open-outline" size={18} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingRight: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: font.black, letterSpacing: -0.6 },
  veil: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  veilTxt: { fontFamily: font.medium, fontSize: 13.5, flexShrink: 1 },
  cover: { aspectRatio: 16 / 9, borderRadius: radius.lg, marginHorizontal: -4 },
  para: { fontFamily: font.regular },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  revealAll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  revealAllTxt: { fontFamily: font.semibold, fontSize: 14 },
  // azul fixo nos dois temas: o accent do tema escuro não dá contraste AA com texto branco
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: '#2563EB' },
  ctaTxt: { fontFamily: font.bold, fontSize: 16, color: '#FFFFFF', flexShrink: 1, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: font.bold, fontSize: 18 },
  emptyTxt: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  link: { fontFamily: font.semibold, fontSize: 15, marginTop: 8 },
});
