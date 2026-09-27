import { XMLParser } from 'fast-xml-parser';

import type { Source, SourceId } from '@/data/sources';

export type FeedItem = {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  publishedAt: string; // ISO
  excerpt: string;
  image?: string;
  // veículo original quando a fonte é um agregador (Google Notícias)
  publisher?: string;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']);
  return '';
}

function stripHtml(html: string): string {
  return decode(decode(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function firstImage(...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const html = decode(decode(c));
    // Lichess serve imagens por URL assinada; o link inteiro (com &sig=) precisa ser mantido
    const m = html.match(/https:\/\/image\.lichess1\.org\/display\?[^"'\s<>]+/i)
      ?? html.match(/https:\/\/[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]*)?/i);
    if (m) return m[0];
  }
  return undefined;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function parseFeed(xml: string, source: SourceId): FeedItem[] {
  const doc = parser.parse(xml);
  const rssItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const list: any[] = [rssItems ?? atomEntries ?? []].flat();

  return list.map((it) => {
    const link = typeof it.link === 'string'
      ? it.link
      : [it.link].flat().find((l: any) => !l?.['@rel'] || l['@rel'] === 'alternate')?.['@href'] ?? '';
    const group = it['media:group'];
    const rawBody = text(it.description) || text(it.summary) || text(it['content:encoded']) || text(it.content) || text(group?.['media:description']);
    const media = it['media:content']?.['@url'] ?? it['media:thumbnail']?.['@url'] ?? group?.['media:thumbnail']?.['@url'] ?? it.enclosure?.['@url'] ?? '';
    // Google Notícias: "Manchete - Veículo" e o resumo é só a manchete de novo
    const publisher = text(it.source) || undefined;
    let title = stripHtml(text(it.title));
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
    let excerpt = stripHtml(rawBody).replace(/submitted by \/u\/\S+|\[link\]|\[comments\]/g, '').trim();
    if (publisher && excerpt.startsWith(title.slice(0, 30))) excerpt = '';
    const date = text(it.pubDate) || text(it.published) || text(it.updated);
    const url = String(link).trim();
    return {
      id: `${source}-${hash(url || text(it.title))}`,
      source,
      title,
      url,
      publishedAt: new Date(date || Date.now()).toISOString(),
      excerpt: excerpt.slice(0, 420),
      image: firstImage(media, rawBody, text(it['content:encoded']), text(it.content)),
      publisher,
    };
  });
}

export async function fetchSource(src: Source, timeoutMs = 12000): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src.feed, { signal: ctrl.signal, headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml',
        // o Reddit recusa requisições sem User-Agent identificável
        'User-Agent': 'ChessCodexNews/0.1 (Android)',
      },
    });
    if (!res.ok) throw new Error(`${src.id}: HTTP ${res.status}`);
    return parseFeed(await res.text(), src.id);
  } finally {
    clearTimeout(t);
  }
}

/** Foto de capa da matéria via <meta property="og:image">, para feeds que não mandam imagem. */
export async function fetchOgImage(url: string, timeoutMs = 8000): Promise<string | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' } });
    if (!res.ok) return undefined;
    const head = (await res.text()).slice(0, 60000);
    const m = head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? decode(m[1]) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
