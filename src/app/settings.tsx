import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOARD_THEMES, type BoardThemeId } from '@/components/Board';
import { POSTHOG_KEY } from '@/data/config';
import { usePlayers } from '@/lib/digest';
import { SOURCES, type SourceKind } from '@/data/sources';
import { useStore } from '@/lib/store';
import { font, radius, usePalette } from '@/lib/theme';

const owl = require('../../assets/brand/owl.png');

// onde cada tipo de fonte aparece no app
const WHERE: Record<SourceKind, string> = {
  jornal: 'Redação · Hoje',
  geral: 'Imprensa · Hoje e Radar',
  video: 'Vídeo · Radar',
  // o robô às vezes monta história só com post da comunidade, e ela aparece no Hoje
  comunidade: 'Comunidade · Radar e histórias do Hoje',
};

export default function Settings() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { settings, setSettings } = useStore();
  const [word, setWord] = useState('');
  const [region, setRegion] = useState(settings.region);
  const players = usePlayers();

  const toggleSource = (id: (typeof SOURCES)[number]['id']) =>
    setSettings({
      hiddenSources: settings.hiddenSources.includes(id)
        ? settings.hiddenSources.filter((x) => x !== id)
        : [...settings.hiddenSources, id],
    });

  const addWord = () => {
    const w = word.trim().toLowerCase();
    if (w && !settings.mutedWords.includes(w)) setSettings({ mutedWords: [...settings.mutedWords, w] });
    setWord('');
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40, gap: 22 }}>
      <View style={styles.top}>
        <Text style={[styles.h1, { color: c.ink }]}>Ajustes</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
          <Text style={[styles.done, { color: c.accent }]}>OK</Text>
        </Pressable>
      </View>

      <Group title="Aparência">
        <Row icon="contrast" label="Tema">
          <View style={styles.seg}>
            {(['system', 'light', 'dark'] as const).map((t) => (
              <Pressable key={t} onPress={() => setSettings({ theme: t })} style={[styles.segWide, { backgroundColor: settings.theme === t ? c.ink : c.surfaceAlt }]}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: settings.theme === t ? c.bg : c.inkSoft }}>
                  {t === 'system' ? 'Auto' : t === 'light' ? 'Claro' : 'Escuro'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Row>
        <Row icon="grid" label="Tabuleiro">
          <View style={styles.seg}>
            {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => (
              <Pressable
                key={id}
                onPress={() => setSettings({ board: id })}
                accessibilityLabel={BOARD_THEMES[id].name}
                style={[styles.swatch, { borderColor: settings.board === id ? c.whisky : 'transparent' }]}
              >
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[0, 1, 1, 0].map((d, i) => (
                    <View key={i} style={{ width: '50%', height: '50%', backgroundColor: d ? BOARD_THEMES[id].dark : BOARD_THEMES[id].light }} />
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        </Row>
      </Group>

      <Group title="Leitura">
        <Row icon="eye-off" label="Modo Anti-Spoiler" hint="Esconde placares e resultados nas manchetes">
          <Switch value={settings.antiSpoiler} onValueChange={(v) => setSettings({ antiSpoiler: v })} trackColor={{ true: c.whisky, false: c.surfaceAlt }} thumbColor="#fff" />
        </Row>
        <Row icon="language" label="Traduzir para português" hint="Manchetes e resumos feitos pela IA, sempre com link da fonte">
          <Switch value={settings.translate} onValueChange={(v) => setSettings({ translate: v })} trackColor={{ true: c.whisky, false: c.surfaceAlt }} thumbColor="#fff" />
        </Row>
        <Row icon="text" label="Tamanho do texto">
          <View style={styles.seg}>
            {[0.9, 1, 1.15].map((v, i) => (
              <Pressable key={v} onPress={() => setSettings({ textScale: v })} style={[styles.segBtn, { backgroundColor: settings.textScale === v ? c.ink : c.surfaceAlt }]}>
                <Text style={{ fontFamily: font.bold, fontSize: 12 + i * 3, color: settings.textScale === v ? c.bg : c.inkSoft }}>A</Text>
              </Pressable>
            ))}
          </View>
        </Row>
      </Group>

      <Group title="Sua região">
        <View style={[styles.inputRow, { borderBottomColor: 'transparent' }]}>
          <Ionicons name="location" size={18} color={c.whisky} style={{ marginRight: 10 }} />
          <TextInput
            value={region}
            onChangeText={setRegion}
            onEndEditing={() => setSettings({ region: region.trim() })}
            onSubmitEditing={() => setSettings({ region: region.trim() })}
            placeholder="Cidade ou estado (ex.: Porto Alegre)"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.ink }]}
            returnKeyType="done"
          />
        </View>
      </Group>

      <Group title="Seguir jogadores · ranking FIDE">
        <Text style={[styles.groupHint, { color: c.muted }]}>
          {settings.following.length
            ? 'Notícias que citam os marcados sobem nas Notícias do dia, no Hoje.'
            : 'Nenhum marcado: notícias do Top 10 inteiro sobem nas Notícias do dia, no Hoje.'}
        </Text>
        <View style={styles.words}>
          {players.map((p) => {
            const on = settings.following.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => setSettings({ following: on ? settings.following.filter((x) => x !== p.id) : [...settings.following, p.id] })}
                style={[styles.word, { backgroundColor: on ? c.whisky : c.surfaceAlt }]}
              >
                <Ionicons name={on ? 'checkmark' : 'add'} size={13} color={on ? c.surface : c.muted} />
                <Text style={[styles.wordTxt, { color: on ? c.surface : c.inkSoft }]}>
                  {p.list === 'women' ? '♛ ' : ''}{p.rank}. {p.name} · {p.rating}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>

      <Group title="Fontes">
        {SOURCES.map((s) => (
          <Row key={s.id} dot={s.color} label={s.name} hint={WHERE[s.kind]}>
            <Switch value={!settings.hiddenSources.includes(s.id)} onValueChange={() => toggleSource(s.id)} trackColor={{ true: c.whisky, false: c.surfaceAlt }} thumbColor="#fff" />
          </Row>
        ))}
      </Group>

      <Group title="Silenciar palavras">
        <View style={[styles.inputRow, { borderBottomColor: c.hairline }]}>
          <TextInput
            value={word}
            onChangeText={setWord}
            onSubmitEditing={addWord}
            placeholder="ex.: bullet, Kramnik"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.ink }]}
            returnKeyType="done"
          />
          <Pressable onPress={addWord} hitSlop={8}>
            <Ionicons name="add-circle" size={24} color={c.whisky} />
          </Pressable>
        </View>
        <View style={styles.words}>
          {settings.mutedWords.map((w) => (
            <Pressable key={w} onPress={() => setSettings({ mutedWords: settings.mutedWords.filter((x) => x !== w) })} style={[styles.word, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.wordTxt, { color: c.inkSoft }]}>{w}</Text>
              <Ionicons name="close" size={13} color={c.muted} />
            </Pressable>
          ))}
        </View>
      </Group>

      <View style={styles.about}>
        <Image source={owl} style={styles.logo} />
        <Text style={[styles.aboutName, { color: c.ink }]}>Chess Codex</Text>
        <Text style={[styles.aboutTxt, { color: c.muted }]}>
          Versão 0.1 · Sem conta, sem servidor.{'\n'}Suas preferências, curtidas e salvos ficam só neste aparelho.
          {/* só aparece quando as estatísticas estão ligadas de fato */}
          {POSTHOG_KEY ? '\nEstatísticas de uso anônimas, sem nome nem e-mail, ajudam a melhorar o app.' : ''}
        </Text>
      </View>
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.groupTitle, { color: c.muted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.hairline }]}>{children}</View>
    </View>
  );
}

function Row({ icon, dot, label, hint, children }: { icon?: keyof typeof Ionicons.glyphMap; dot?: string; label: string; hint?: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { borderBottomColor: c.hairline }]}>
      {icon ? <Ionicons name={icon} size={18} color={c.whisky} /> : null}
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: c.ink }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: c.muted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  h1: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.8 },
  done: { fontFamily: font.bold, fontSize: 17 },
  groupHint: { fontFamily: font.regular, fontSize: 12.5, paddingHorizontal: 14, paddingTop: 12 },
  groupTitle: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.8, paddingHorizontal: 6 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: { fontFamily: font.semibold, fontSize: 15.5 },
  rowHint: { fontFamily: font.regular, fontSize: 12.5, marginTop: 1 },
  seg: { flexDirection: 'row', gap: 6 },
  segWide: { paddingHorizontal: 10, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 34, height: 34, borderRadius: 9, borderWidth: 2, overflow: 'hidden', padding: 2 },
  segBtn: { width: 36, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15.5, paddingVertical: 12 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  word: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  wordTxt: { fontFamily: font.medium, fontSize: 13 },
  about: { alignItems: 'center', gap: 6, paddingTop: 10 },
  logo: { width: 64, height: 64, borderRadius: 16 },
  aboutName: { fontFamily: font.bold, fontSize: 17 },
  aboutTxt: { fontFamily: font.regular, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
});
