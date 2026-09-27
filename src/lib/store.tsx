import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { BoardThemeId } from '@/components/Board';
import { DIGEST_URL } from '@/data/config';
import bundledDigest from '@/data/digest.json';
import snapshot from '@/data/snapshot.json';
import { SOURCES, localSource, type SourceId } from '@/data/sources';
import type { Digest } from './digest';
import { fetchOgImage, fetchSource, type FeedItem } from './rss';
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
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  revealed: Set<string>;
  reveal: (id: string) => void;
  digest: Digest;
};

const DEFAULTS: Settings = { antiSpoiler: false, hiddenSources: [], textScale: 1, mutedWords: [], theme: 'system', board: 'madeira', translate: true, following: [], region: '' };
const K = { items: 'cc.items', saved: 'cc.saved', settings: 'cc.settings', digest: 'cc.digest' };

const Ctx = createContext<Store | null>(null);

function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Posts da comunidade Lichess em outros alfabetos poluem um feed em PT; filtra no MVP.
const latinOnly = (i: FeedItem) => !/[Ѐ-ӿ؀-ۿऀ-ॿ一-鿿]/.test(i.title);

export function StoreProvider({ children }: { children: ReactNode }) {
  // começa pelo que for mais novo entre o feed do robô e o snapshot embutido
  const [items, setItems] = useState<FeedItem[]>(() =>
    dedupe([...((bundledDigest as Digest).feed ?? []), ...(snapshot.items as FeedItem[])]).filter(latinOnly),
  );
  const [updatedAt, setUpdatedAt] = useState(
    (bundledDigest.generatedAt ?? '') > snapshot.fetchedAt ? (bundledDigest.generatedAt as string) : snapshot.fetchedAt,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<SourceId[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULTS);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [digest, setDigest] = useState<Digest>(bundledDigest as Digest);

  useEffect(() => {
    (async () => {
      try {
        const [i, s, st, dg] = await AsyncStorage.multiGet([K.items, K.saved, K.settings, K.digest]);
        if (dg[1]) {
          const cached = JSON.parse(dg[1]) as Digest;
          if ((cached.generatedAt ?? '') > (bundledDigest.generatedAt ?? '')) setDigest(cached);
        }
        if (i[1]) {
          const cached = JSON.parse(i[1]) as { items: FeedItem[]; updatedAt: string };
          if (cached.updatedAt > snapshot.fetchedAt) {
            setItems(cached.items);
            setUpdatedAt(cached.updatedAt);
          }
        }
        if (s[1]) setSaved(JSON.parse(s[1]));
        if (st[1]) setSettingsState({ ...DEFAULTS, ...JSON.parse(st[1]) });
      } catch {
        // cache corrompido: segue com o snapshot embutido
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    let remote: Digest | null = null;
    try {
      remote = (await (await fetch(DIGEST_URL, { cache: 'no-store' })).json()) as Digest;
      setDigest(remote);
      AsyncStorage.setItem(K.digest, JSON.stringify(remote)).catch(() => {});
    } catch {
      // sem rede ou ainda não publicado: fica com o digest anterior
    }
    // No navegador os feeds são bloqueados por CORS: o site vive só do feed publicado pelo robô.
    if (Platform.OS === 'web') {
      if (remote?.feed?.length && remote.generatedAt) {
        setItems(dedupe(remote.feed).filter(latinOnly));
        setUpdatedAt(remote.generatedAt);
      }
      setRefreshing(false);
      return;
    }
    const sources = settings.region ? [...SOURCES, localSource(settings.region)] : SOURCES;
    const results = await Promise.allSettled(sources.map((s) => fetchSource(s)));
    const fresh: FeedItem[] = [];
    const failed: SourceId[] = [];
    results.forEach((r, idx) => (r.status === 'fulfilled' ? fresh.push(...r.value) : failed.push(sources[idx].id)));
    setErrors(failed);
    if (fresh.length) {
      // reaproveita fotos já descobertas e busca og:image das 40 mais recentes que vierem sem foto
      const known = new Map(items.filter((i) => i.image).map((i) => [i.url, i.image]));
      for (const i of fresh) i.image ??= known.get(i.url);
      const needPhoto = fresh.filter((i) => !i.image && !i.source.startsWith('gnews') && !i.source.startsWith('yt-') && i.source !== 'reddit').slice(0, 40);
      for (let k = 0; k < needPhoto.length; k += 6) {
        await Promise.all(needPhoto.slice(k, k + 6).map(async (i) => { i.image = await fetchOgImage(i.url); }));
      }
      // mantém itens antigos das fontes que falharam
      const next = dedupe([...fresh, ...items.filter((i) => failed.includes(i.source))]).filter(latinOnly).slice(0, 300);
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

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(K.settings, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reveal = useCallback((id: string) => setRevealed((p) => new Set(p).add(id)), []);

  const value = useMemo(
    () => ({ items, updatedAt, refreshing, errors, refresh, saved, toggleSaved, settings, setSettings, revealed, reveal, digest }),
    [items, updatedAt, refreshing, errors, refresh, saved, toggleSaved, settings, setSettings, revealed, reveal, digest],
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
