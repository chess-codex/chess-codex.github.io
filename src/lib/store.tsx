import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { BoardThemeId } from '@/components/Board';
import { DIGEST_URL } from '@/data/config';
import bundledDigest from '@/data/digest.json';
import snapshot from '@/data/snapshot.json';
import { SOURCES, isKnownItemId, isKnownSource, localSource, wantsOgImage, type SourceId } from '@/data/sources';
import { track } from './analytics';
import type { Digest, DigestStory } from './digest';
import { fetchOgImage, fetchSource, notPhoto, type FeedItem } from './rss';
import { ThemePrefContext, type ThemePref } from './theme';

// Tudo mora no aparelho. Sem conta, sem servidor, sem banco na nuvem.
type Settings = {
  antiSpoiler: boolean;
  hiddenSources: SourceId[];
  textScale: number;
  mutedWords: string[];
  theme: ThemePref;
  board: BoardThemeId;
  translate: boolean;
  following: string[];
  region: string;
};

type Store = {
  items: FeedItem[];
  updatedAt: string;
  refreshing: boolean;
  errors: SourceId[];
  refresh: () => Promise<void>;
  saved: string[];
  toggleSaved: (id: string) => void;
  liked: string[];
  toggleLiked: (id: string, info?: { category?: string; title?: string }) => void;
  // categoria de cada curtida (id → categoriaKey); alimenta a ordem das Notícias do dia
  likedCategories: Record<string, string>;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  revealed: Set<string>;
  reveal: (id: string) => void;
  digest: Digest;
};

const DEFAULTS: Settings = { antiSpoiler: false, hiddenSources: [], textScale: 1, mutedWords: [], theme: 'system', board: 'madeira', translate: true, following: [], region: '' };
const K = {
  items: 'cc.items', saved: 'cc.saved', settings: 'cc.settings', digest: 'cc.digest',
  liked: 'cc.liked', likedCategories: 'cc.liked.cat',
};

const Ctx = createContext<Store | null>(null);

// o app_open sai uma vez por abertura, mesmo que o provider remonte
let opened = false;

// acentos combinantes (U+0300 a U+036F) montados por código, sem caractere invisível no fonte
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Categoria em forma comparável: 'Ciência', 'ciencia' e ' CIÊNCIA ' viram a mesma chave. */
export function categoryKey(s: string): string {
  return s.normalize('NFD').replace(ACCENTS, '').toLowerCase().trim();
}

function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Posts da comunidade Lichess em outros alfabetos poluem um feed em PT; filtra no MVP.
// Item de fonte que saiu do app (o r/chess, em cache ou em digest antigo) também fica de fora.
const keepItem = (i: FeedItem) => isKnownSource(i.source) && !/[Ѐ-ӿ؀-ۿऀ-ॿ一-鿿]/.test(i.title);

/**
 * Tira do digest o que veio de fonte removida: do feed, das histórias e dos tópicos delas.
 * O item da história é reconhecido pelo id, porque a edição anterior que o robô mantém (ou o
 * checkpoint publicado quando ele cai no meio) pode citar item que já nem está no feed.
 */
function cleanDigest(d: Digest): Digest {
  const feed = Array.isArray(d.feed) ? d.feed : [];
  const stories = Array.isArray(d.stories) ? d.stories : [];
  const points = (s: DigestStory) => (Array.isArray(s.points) ? s.points : []);
  const stale =
    feed.some((i) => !isKnownSource(i.source)) ||
    stories.some((s) => s && Array.isArray(s.itemIds) && (!s.itemIds.every(isKnownItemId) || points(s).some((p) => !isKnownSource(p?.source))));
  if (!stale) return d;
  return {
    ...d,
    feed: feed.filter((i) => isKnownSource(i.source)),
    stories: stories
      // história malformada segue como veio: o useArticles já a descarta
      .map((s) => (s && Array.isArray(s.itemIds)
        ? { ...s, itemIds: s.itemIds.filter(isKnownItemId), points: s.points && points(s).filter((p) => isKnownSource(p?.source)) }
        : s))
      .filter((s) => !s || !Array.isArray(s.itemIds) || s.itemIds.length > 0),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // começa pelo que for mais novo entre o feed do robô e o snapshot embutido
  const [items, setItems] = useState<FeedItem[]>(() =>
    dedupe([...((bundledDigest as Digest).feed ?? []), ...(snapshot.items as FeedItem[])]).filter(keepItem),
  );
  const [updatedAt, setUpdatedAt] = useState(
    (bundledDigest.generatedAt ?? '') > snapshot.fetchedAt ? (bundledDigest.generatedAt as string) : snapshot.fetchedAt,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<SourceId[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  // curtidas e suas categorias andam juntas para nunca ficarem fora de sincronia
  const [likes, setLikes] = useState<{ ids: string[]; cats: Record<string, string> }>({ ids: [], cats: {} });
  const [settings, setSettingsState] = useState<Settings>(DEFAULTS);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [digest, setDigest] = useState<Digest>(() => cleanDigest(bundledDigest as Digest));
  // edição mais nova que o aparelho já tem (embutida, guardada ou baixada); o refresh compara com ela
  const digestAt = useRef(bundledDigest.generatedAt ?? '');

  useEffect(() => {
    (async () => {
      try {
        const [i, s, st, dg, lk, lc] = await AsyncStorage.multiGet([K.items, K.saved, K.settings, K.digest, K.liked, K.likedCategories]);
        if (dg[1]) {
          const cached = JSON.parse(dg[1]) as Digest;
          // o download do refresh pode ter chegado antes da leitura do cache: nunca volta para uma edição mais velha
          if ((cached.generatedAt ?? '') > digestAt.current) {
            digestAt.current = cached.generatedAt ?? '';
            setDigest(cleanDigest(cached));
          }
        }
        if (i[1]) {
          const cached = JSON.parse(i[1]) as { items: FeedItem[]; updatedAt: string };
          if (cached.updatedAt > snapshot.fetchedAt) {
            setItems(cached.items.filter(keepItem));
            setUpdatedAt(cached.updatedAt);
          }
        }
        if (s[1]) setSaved(JSON.parse(s[1]));
        if (lk[1]) setLikes({ ids: JSON.parse(lk[1]), cats: lc[1] ? JSON.parse(lc[1]) : {} });
        if (st[1]) setSettingsState({ ...DEFAULTS, ...JSON.parse(st[1]) });
      } catch {
        // cache corrompido: segue com o snapshot embutido
      }
      if (!opened) {
        opened = true;
        track('app_open');
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    let remote: Digest | null = null;
    try {
      const raw = (await (await fetch(DIGEST_URL, { cache: 'no-store' })).json()) as Digest;
      // Publicado mais velho que o do aparelho (o robô falhou e o site saiu com uma cópia antiga):
      // fica a edição que o leitor já tem, em vez de voltar no tempo
      if ((raw?.generatedAt ?? '') >= digestAt.current) {
        const fetched = cleanDigest(raw);
        remote = fetched;
        digestAt.current = fetched.generatedAt ?? '';
        setDigest(fetched);
        AsyncStorage.setItem(K.digest, JSON.stringify(fetched)).catch(() => {});
      }
    } catch {
      // sem rede ou ainda não publicado: fica com o digest anterior
    }
    // No navegador os feeds são bloqueados por CORS: o site vive só do feed publicado pelo robô.
    if (Platform.OS === 'web') {
      if (remote?.feed?.length && remote.generatedAt) {
        setItems(dedupe(remote.feed).filter(keepItem));
        setUpdatedAt(remote.generatedAt);
      }
      setRefreshing(false);
      return;
    }
    const sources = settings.region ? [...SOURCES, localSource(settings.region)] : SOURCES;
    // canais do YouTube só pelo robô (API com chave): o RSS de canal do YouTube saiu do ar
    const results = await Promise.allSettled(sources.filter((s) => !s.feed.includes('youtube.com/feeds')).map((s) => fetchSource(s)));
    const fresh: FeedItem[] = [];
    const failed: SourceId[] = [];
    results.forEach((r, idx) => (r.status === 'fulfilled' ? fresh.push(...r.value) : failed.push(sources[idx].id)));
    setErrors(failed);
    if (fresh.length) {
      // reaproveita fotos já descobertas e busca og:image das 40 mais recentes que vierem sem foto
      // (as que o robô achou chegam no feed do digest e poupam o download da página no celular)
      const known = new Map([...(remote?.feed ?? []), ...items].filter((i) => i.image && !notPhoto(i.image)).map((i) => [i.url, i.image]));
      for (const i of fresh) i.image ??= known.get(i.url);
      // fresh vem na ordem das fontes: sem ordenar, as 40 seriam só do Chess.com (inglês e português)
      const needPhoto = fresh
        .filter((i) => !i.image && wantsOgImage(i.source))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, 40);
      for (let k = 0; k < needPhoto.length; k += 6) {
        await Promise.all(needPhoto.slice(k, k + 6).map(async (i) => { i.image = await fetchOgImage(i.url); }));
      }
      // mantém itens antigos das fontes que falharam
      const next = dedupe([...fresh, ...items.filter((i) => failed.includes(i.source))]).filter(keepItem).slice(0, 300);
      const now = new Date().toISOString();
      setItems(next);
      setUpdatedAt(now);
      AsyncStorage.setItem(K.items, JSON.stringify({ items: next, updatedAt: now })).catch(() => {});
    }
    setRefreshing(false);
  }, [items, settings.region]);

  useEffect(() => {
    // agenda fora do corpo do efeito: busca inicial sem render em cascata
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(K.saved, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleLiked = useCallback((id: string, info?: { category?: string; title?: string }) => {
    setLikes((prev) => {
      const on = prev.ids.includes(id);
      const ids = on ? prev.ids.filter((x) => x !== id) : [id, ...prev.ids];
      // só a categoria fica guardada: o título não serve pra ordenar e não precisa morar aqui
      const cats = Object.fromEntries(Object.entries(prev.cats).filter(([k]) => k !== id));
      if (!on && info?.category) cats[id] = categoryKey(info.category);
      AsyncStorage.multiSet([[K.liked, JSON.stringify(ids)], [K.likedCategories, JSON.stringify(cats)]]).catch(() => {});
      return { ids, cats };
    });
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(K.settings, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reveal = useCallback((id: string) => setRevealed((p) => new Set(p).add(id)), []);

  const value = useMemo(
    () => ({
      items, updatedAt, refreshing, errors, refresh, saved, toggleSaved,
      liked: likes.ids, toggleLiked, likedCategories: likes.cats,
      settings, setSettings, revealed, reveal, digest,
    }),
    [items, updatedAt, refreshing, errors, refresh, saved, toggleSaved, likes, toggleLiked, settings, setSettings, revealed, reveal, digest],
  );
  return (
    <Ctx.Provider value={value}>
      <ThemePrefContext.Provider value={settings.theme}>{children}</ThemePrefContext.Provider>
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}

export function useVisibleItems(filter?: (i: FeedItem) => boolean): FeedItem[] {
  const { items, settings } = useStore();
  return useMemo(() => {
    const muted = settings.mutedWords.map((w) => w.toLowerCase()).filter(Boolean);
    return items.filter(
      (i) =>
        !settings.hiddenSources.includes(i.source) &&
        !muted.some((w) => i.title.toLowerCase().includes(w)) &&
        (!filter || filter(i)),
    );
  }, [items, settings, filter]);
}
