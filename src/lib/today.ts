import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { categoryOf } from '@/components/ui';
import type { MicroArticle } from '@/data/edition';
import { mentions } from '@/data/players';
import { SOURCES, sourceById } from '@/data/sources';

import { useArticles, usePlayers } from './digest';
import type { FeedItem } from './rss';
import { categoryKey, useStore, useVisibleItems } from './store';
import { similar, titleKey, titleWords } from './titles';

// A edição do Hoje (destaques + Notícias do dia), num lugar só: o Hoje mostra, o Radar
// usa para não repetir o que já está no Hoje.

// teto de cartões nas Notícias do dia, somando histórias e itens soltos
export const MAX_NEWS = 20;
// destaques no carrossel do topo: variedade sem voltar a encher a tela
export const HIGHLIGHTS = 3;
// os destaques saem das 8 histórias mais importantes, com foto primeiro: são a capa da edição
const HIGHLIGHT_POOL = 8;
const HOUR = 3_600_000;
// bônus pequenos, medidos em horas de frescor: sobem a notícia sem enterrar a que acabou de sair
const FOLLOW_BONUS = 6 * HOUR;
const LIKE_BONUS = 3 * HOUR; // por curtida na mesma categoria, contando até 2
// notícia com texto completo nosso sobe na frente das que só têm o resumo curto: a gazeta abre com leitura
const TEXT_BONUS = 48 * HOUR;

// o Google Notícias põe o veículo no fim do título ("... – International Chess Federation")
const originalTitle = (i: FeedItem) => (i.source.startsWith('gnews') ? i.title.replace(/\s[-–—]\s[^-–—]+$/, '') : i.title);

// Redações de xadrez pelo nome. Pelo Google Notícias elas repetem o que o feed direto já traz.
// "Chess News | ChessBase" é a ChessBase; "ChessBase India" é outro veículo.
const JORNAL_NAMES = new Set(SOURCES.filter((s) => s.kind === 'jornal').map((s) => categoryKey(s.name)));
const fromJornal = (publisher?: string) => !!publisher && publisher.split(/\s[|–-]\s/).some((p) => JORNAL_NAMES.has(categoryKey(p)));

export type Entry = { story: MicroArticle } | { item: FeedItem };

export function useToday() {
  const { settings, digest, liked, likedCategories, updatedAt } = useStore();
  const articles = useArticles();
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
  // com foto primeiro, na ordem de importância do robô; sem foto só completa se faltar
  const highlights = useMemo(() => {
    const top = visible.slice(0, HIGHLIGHT_POOL);
    return [...top.filter((a) => a.image), ...top.filter((a) => !a.image)].slice(0, HIGHLIGHTS);
  }, [visible]);

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
        const full = !!digest.articles?.[i.id]?.paragraphs?.some((p) => p.trim());
        const score = (Date.parse(i.publishedAt) || 0) + (follow ? FOLLOW_BONUS : 0) + cat * LIKE_BONUS + (full ? TEXT_BONUS : 0);
        return { i, pt, score };
      })
      // palavra silenciada vale também para a manchete traduzida
      .filter(({ pt }) => !muted.some((w) => pt.toLowerCase().includes(w)))
      .sort((a, b) => b.score - a.score);

    // histórias primeiro, na ordem do robô; os destaques já estão lá em cima
    const shown = new Set(highlights.map((a) => a.id));
    const out: Entry[] = visible.filter((a) => !shown.has(a.id)).slice(0, MAX_NEWS).map((a) => ({ story: a }));
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
  }, [pool, articles, visible, highlights, muted, players, settings.following, likeSnap, digest]);

  return { visible, highlights, news };
}
