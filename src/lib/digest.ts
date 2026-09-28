import { useMemo } from 'react';

import { EDITION, type MicroArticle } from '@/data/edition';
import { BUNDLED_PLAYERS, type Player } from '@/data/players';
import type { FeedItem } from './rss';
import { useStore } from './store';
import { overlap, titleWords } from './titles';

export type Category = 'torneios' | 'jogadores' | 'ciencia' | 'cultura' | 'plataformas' | 'polemica' | 'video' | 'outro';
export type Translation = {
  title: string; summary: string; safeTitle: string; spoiler: boolean;
  category: Category; relevant: boolean;
  // checked = o resumo curto foi conferido contra o título e o trecho da fonte; só assim ele aparece
  checked?: boolean;
};
// Resumo em PT de uma matéria do feed, escrito pela IA e checado frase a frase contra a fonte.
// paragraphs vazio + failedAt = tentativa que falhou; o robô só tenta de novo depois de 24 h.
export type ArticleText = { paragraphs: string[]; words: number; source: string; generatedAt: string; failedAt?: string };
export type DigestStory = {
  itemIds: string[]; kicker: string; title: string; safeTitle?: string; dek: string;
  bullets?: string[]; context?: string; tag: MicroArticle['tag']; spoiler?: boolean;
  // checked = o resumo da fonte foi conferido contra o título e o trecho dela
  points?: { id: string; source: FeedItem['source']; publisher: string | null; text: string; checked?: boolean }[];
  gameKey?: string;
  // "O que aconteceu" em texto corrido; "por que importa" só vem quando as fontes sustentam
  body?: string[];
  why?: string;
};
export type Digest = {
  generatedAt: string | null;
  model: string | null;
  feed: FeedItem[];
  items: Record<string, Translation>;
  stories: DigestStory[];
  games?: unknown[];
  players?: Player[];
  // chave = id do item do feed; digests antigos não têm o campo
  articles?: Record<string, ArticleText>;
};

const TAGS: MicroArticle['tag'][] = ['Torneios', 'Jogadores', 'Plataformas', 'Bastidores'];

/** Minutos de leitura a ~200 palavras por minuto, nunca menos de 1. */
export const readMinutes = (words: number) => Math.max(1, Math.ceil(words / 200));
const countWords = (texts: string[]) => texts.join(' ').split(/\s+/).filter(Boolean).length;

/** Histórias do robô convertidas em micro-artigos; sem robô, usa a edição exemplo. */
export function useArticles(): MicroArticle[] {
  const { digest, items } = useStore();
  return useMemo(() => {
    // o digest remoto não tem tipo garantido: história sem título em texto fica de fora,
    // e kicker fora de texto vira a editoria (senão o toUpperCase dos cartões derruba o Hoje)
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const stories = (Array.isArray(digest.stories) ? digest.stories : []).filter(
      (s) => s && text(s.title) && Array.isArray(s.itemIds) && s.itemIds.length,
    );
    if (!stories.length) return EDITION.articles;
    const byId = new Map([...digest.feed, ...items].map((i) => [i.id, i]));
    // matérias com texto nosso completo (já conferido): o destaque sem texto corrido usa o da
    // própria fonte ou o da matéria irmã (mesmo fato, outra fonte), que entra na cobertura e
    // assim não aparece de novo solta no Hoje
    const paras = (id: string) => digest.articles?.[id]?.paragraphs?.filter((p) => typeof p === 'string' && p.trim()) ?? [];
    const withText = [...byId.values()].filter((i) => paras(i.id).length);
    const used = new Set<string>();
    return stories.map((s, n) => {
      let refs = s.itemIds.map((id) => byId.get(id)).filter((i): i is FeedItem => i != null);
      let body = s.body?.filter((p) => typeof p === 'string' && p.trim());
      if (!body?.length) {
        const words = titleWords(text(s.title));
        const own = refs.find((r) => paras(r.id).length);
        const sister =
          own ??
          withText
            .filter((i) => !used.has(i.id))
            .map((i) => ({ i, o: Math.max(overlap(words, titleWords(digest.items[i.id]?.title ?? '')), overlap(words, titleWords(i.title))) }))
            .filter((x) => x.o >= 0.5)
            .sort((a, b) => b.o - a.o)[0]?.i;
        if (sister) {
          used.add(sister.id);
          body = paras(sister.id);
          if (!refs.some((r) => r.id === sister.id)) refs = [...refs, sister];
        }
      }
      // why '' = as fontes não sustentam: não cai no contexto antigo, que não foi checado.
      // Só digest sem o campo why usa o context.
      const context = typeof s.why === 'string' ? s.why.trim() || undefined : s.context;
      const title = text(s.title);
      const tag = TAGS.includes(s.tag) ? s.tag : 'Bastidores';
      return {
        id: `d${n}-${s.itemIds[0]}`,
        kicker: text(s.kicker) || tag,
        title,
        safeTitle: text(s.safeTitle) || title,
        // sem frase da IA: a linha de apoio é o resumo conferido de uma das fontes; sem conferência, nada
        dek: text(s.dek) || s.points?.find((p) => p.checked && text(p.text))?.text || '',
        image: refs.find((r) => r.image)?.image,
        bullets: s.bullets?.slice(0, 3),
        points: s.points
          ?.map((p) => ({ source: p.source, publisher: p.publisher ?? undefined, text: p.text, url: byId.get(p.id)?.url ?? '', checked: p.checked }))
          .filter((p) => p.url),
        body: body?.length ? body : undefined,
        context,
        coverage: refs.map((r) => ({ source: r.source, title: digest.items[r.id]?.title ?? r.title, url: r.url })),
        tag,
        // com texto nosso, o tempo sai da contagem de palavras; sem ele, é leitura de 1 min
        minutes: body?.length ? readMinutes(countWords([...body, context ?? ''])) : 1,
        publishedAt: refs[0]?.publishedAt ?? digest.generatedAt ?? '',
        spoiler: !!s.spoiler,
        game: s.gameKey ? { key: s.gameKey } : undefined,
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

/** Resumo nosso da matéria, quando o robô conseguiu escrever e checar um. */
export function useArticleText(id: string): ArticleText | undefined {
  const { digest, settings } = useStore();
  // tradução desligada = o leitor pediu o original: cartão, selo e leitor ficam sem o texto da IA
  if (!settings.translate) return undefined;
  const a = digest.articles?.[id];
  // texto vazio não conta: o leitor cai no resumo curto
  return a?.paragraphs?.some((p) => p.trim()) ? a : undefined;
}
