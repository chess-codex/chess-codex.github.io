import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameStory, MiniBoard } from '@/components/MiniBoard';
import { fmtClock, fmtEval, gameDay, gameLink, keyCaption, keyTitle, resultLabel, useGameLookup } from '@/lib/games';
import { useResultHidden } from '@/lib/spoiler';
import { font, radius, usePalette } from '@/lib/theme';

const TC_LABEL: Record<string, string> = { blitz: 'blitz', rapid: 'xadrez rápido' };

export default function GameScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  // partida de hoje ou, se já saiu do digest, das edições anteriores (partidas.json)
  const { game, loading, failed, retry } = useGameLookup(key);
  // mesmo "revelar" do tabuleiro e do relato: revelou num lugar, revelou na tela toda
  const hideResult = useResultHidden(key ?? '');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!game) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg, paddingTop: insets.top + 40 }]}>
        {loading ? (
          <ActivityIndicator color={c.whisky} />
        ) : (
          <>
            <Text style={[styles.emptyTxt, { color: c.muted }]}>
              {failed ? 'Não foi possível carregar esta partida agora.' : 'Não encontramos esta partida. As partidas ficam guardadas por 90 dias.'}
            </Text>
            {failed ? (
              <Pressable onPress={retry}>
                <Text style={[styles.link, { color: c.accent }]}>Tentar de novo</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={back}>
              <Text style={[styles.link, { color: c.accent }]}>Voltar</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  // crédito certo: os lances vêm da transmissão; a análise é do nosso Stockfish (partidas antigas
  // sem o campo engine ainda tinham a avaliação da própria transmissão)
  const ours = game.engine?.startsWith('Stockfish');
  const credit = ours
    ? `Lances: transmissão oficial do torneio (Lichess) · Análise: ${game.engine}, calculada pelo Chess Codex.`
    : 'Lances e avaliações: transmissão oficial do torneio (Lichess).';
  const day = gameDay(game);
  const acc = game.accuracy;

  // dados que saem direto do PGN e da análise do motor. No Anti-Spoiler a variação da avaliação
  // fica oculta junto com o resultado: "+1,2 → +4,7" diz quem ganhou do mesmo jeito
  const facts = [
    { label: 'Resultado', value: hideResult ? '•–•' : resultLabel(game) },
    { label: 'Lances', value: String(Math.ceil(game.moves.length / 2)) },
    { label: 'Momento-chave', value: hideResult ? 'oculto' : `${fmtEval(game.keyBefore)} → ${fmtEval(game.keyAfter)}` },
    ...(game.keyClock != null ? [{ label: 'Relógio no lance', value: fmtClock(game.keyClock) }] : []),
    // precisão diz quem jogou melhor: fica de fora no Anti-Spoiler
    ...(!hideResult && acc && Number.isFinite(acc.white) && Number.isFinite(acc.black)
      ? [{ label: 'Precisão (brancas · pretas)', value: `${Math.round(acc.white)}% · ${Math.round(acc.black)}%` }]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6, borderBottomColor: c.hairline }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.barBtn}>
          <Ionicons name="chevron-back" size={24} color={c.ink} />
          <Text style={[styles.barTxt, { color: c.ink }]}>Voltar</Text>
        </Pressable>
        <Pressable
          // o link é a página da partida no Chess Codex, não a transmissão
          onPress={() =>
            Share.share({ message: `${game.white} x ${game.black} (${game.event}, ${game.round})\n${keyCaption(game, hideResult)}\n\nNo Chess Codex: ${gameLink(game.key)}` }).catch(() => {})
          }
          hitSlop={10}
          accessibilityLabel="Compartilhar"
        >
          <Ionicons name="share-outline" size={22} color={c.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={[styles.kicker, { color: c.whisky }]}>{`${keyTitle(game, hideResult)} · ${game.round}`.toUpperCase()}</Text>
          <Text style={[styles.title, { color: c.ink }]}>
            {game.white} <Text style={{ color: c.muted }}>×</Text> {game.black}
          </Text>
          <Text style={[styles.meta, { color: c.muted }]}>
            {[day, TC_LABEL[game.tc ?? ''], game.event, game.whiteTeam && game.blackTeam ? `${game.whiteTeam} × ${game.blackTeam}` : null, game.opening].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.fact, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Text style={[styles.factVal, { color: c.ink }]}>{f.value}</Text>
              <Text style={[styles.factLbl, { color: c.muted }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.blockLabel, { color: c.whisky }]}>A PARTIDA EM TEXTO</Text>
          <GameStory game={game} />
        </View>

        {/* a lista de lances fica dentro do tabuleiro: tocar num lance leva a posição até ele */}
        <MiniBoard game={game} showLink={false} moveList />

        <Text style={[styles.note, { color: c.muted }]}>{credit}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  emptyTxt: { fontFamily: font.regular, fontSize: 15, textAlign: 'center' },
  link: { fontFamily: font.semibold, fontSize: 15 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center' },
  barTxt: { fontFamily: font.medium, fontSize: 16 },
  kicker: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1.1 },
  title: { fontFamily: font.black, fontSize: 26, lineHeight: 31, letterSpacing: -0.6 },
  meta: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, minWidth: '45%', borderRadius: radius.md, padding: 12, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  factVal: { fontFamily: font.black, fontSize: 19, letterSpacing: -0.4 },
  factLbl: { fontFamily: font.medium, fontSize: 11.5 },
  blockLabel: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
