import { useMemo } from 'react';

import { EDITION, type MicroArticle } from '@/data/edition';
import { BUNDLED_PLAYERS, type Player } from '@/data/players';
import type { FeedItem } from './rss';
import { useStore } from './store';

export type Category = 'torneios' | 'jogadores' | 'ciencia' | 'cultura' | 'plataformas' | 'polemica' | 'video' | 'outro';
export type Translation = {
  title: string; summary: string; safeTitle: string; spoiler: boolean;
  category: Category; relevant: boolean;
};
export type DigestStory = {
  itemIds: string[]; kicker: string; title: string; safeTitle?: string; dek: string;
  bullets?: string[]; context?: string; tag: MicroArticle['tag']; spoiler?: boolean;
  points?: { id: string; source: FeedItem['source']; publisher: string | null; text: string }[];
};
export type Digest = {
  generatedAt: string | null;
  model: string | null;
  feed: FeedItem[];
  items: Record<string, Translation>;
  stories: DigestStory[];
  players?: Player[];
};

/** Histórias do robô convertidas em micro-artigos; sem robô, usa a edição exemplo. */
export function useArticles(): MicroArticle[] {
  const { digest, items } = useStore();
  return useMemo(() => {
    if (!digest.stories.length) return EDITION.articles;
    const byId = new Map([...digest.feed, ...items].map((i) => [i.id, i]));
    return digest.stories.map((s, n) => {
      const refs = s.itemIds.map((id) => byId.get(id)).filter((i): i is FeedItem => i != null);
      return {
        id: `d${n}-${s.itemIds[0]}`,
        kicker: s.kicker,
        title: s.title,
        safeTitle: s.safeTitle ?? s.title,
        // sem frase da IA: a linha de apoio é o resumo da fonte principal
        dek: s.dek || s.points?.[0]?.text || '',
        image: refs.find((r) => r.image)?.image,
        bullets: s.bullets?.slice(0, 3),
        points: s.points
          ?.map((p) => ({ source: p.source, publisher: p.publisher ?? undefined, text: p.text, url: byId.get(p.id)?.url ?? '' }))
          .filter((p) => p.url),
        context: s.context,
        coverage: refs.map((r) => ({ source: r.source, title: digest.items[r.id]?.title ?? r.title, url: r.url })),
        tag: s.tag,
        minutes: 1,
        publishedAt: refs[0]?.publishedAt ?? digest.generatedAt ?? '',
        spoiler: !!s.spoiler,
      };
    });
  }, [digest, items]);
}

/** Ranking vivo do robô; sem ele, a cópia embutida. */
export function usePlayers(): Player[] {
  const { digest } = useStore();
  return digest.players?.length ? digest.players : BUNDLED_PLAYERS;
}

export function useTranslation(id: string): Translation | undefined {
  const { digest, settings } = useStore();
  return settings.translate ? digest.items[id] : undefined;
}
