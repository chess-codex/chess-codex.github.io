import { XMLParser } from 'fast-xml-parser';

// só tipos: os scripts do robô rodam este arquivo direto no Node, que não conhece o atalho "@/"
import type { Source, SourceId } from '@/data/sources';

// API pública do Bluesky (as fontes sociais apontam para ela); a resposta é JSON, não RSS
const isBluesky = (feed: string) => feed.startsWith('https://public.api.bsky.app/');

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

// Não são foto da notícia: avatar do autor (Gravatar, nos blogs do WordPress.com), avatar de perfil,
// a imagem padrão dos blogs do Lichess e o logotipo do site (a FEDA põe o "logot.png" no post).
// Sem foto, o app mostra a arte de reserva, que fica melhor que um logo ou um quadro vazio.
export const notPhoto = (url: string) =>
  /gravatar\.com|avatar_thumbnail|\/avatar\/|user-blog-default|\/logo[^/?#]*\.(?:png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(url);

function firstImage(...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const html = decode(decode(c));
    // Lichess serve imagens por URL assinada; o link inteiro (com &sig=) precisa ser mantido
    const lichess = html.match(/https:\/\/image\.lichess1\.org\/display\?[^"'\s<>]+/i);
    if (lichess) return lichess[0];
    for (const m of html.matchAll(/https:\/\/[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi)) {
      if (!notPhoto(m[0])) return m[0];
    }
  }
  return undefined;
}

/**
 * Foto declarada no item (media:content, media:thumbnail, media:group, enclosure). Quando vem
 * repetida (Guardian: 140 e 460 px; WordPress.com: avatar e foto), o parser devolve uma lista:
 * fica a maior, sem avatar e sem arquivo que não é imagem (áudio, vídeo).
 */
function mediaImage(it: any): string {
  const group = it['media:group'];
  const list: any[] = [
    it['media:content'], it['media:thumbnail'], group?.['media:content'], group?.['media:thumbnail'], it.enclosure,
  ].flat(2).filter((m) => m && typeof m['@url'] === 'string');
  const images = list.filter((m) => {
    const url: string = m['@url'];
    const type = String(m['@type'] ?? m['@medium'] ?? '');
    return /^https?:/.test(url) && !notPhoto(url) && (!type || /image/i.test(type));
  });
  images.sort((a, b) => (Number(b['@width']) || 0) - (Number(a['@width']) || 0));
  return images[0]?.['@url'] ?? '';
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Data do feed em ISO. Aceita ISO e o formato do RSS ("Sat, 27 Sep 2026 18:00:00 +0000"), inclusive
 * sem dia da semana e sem segundos, como manda o Bluesky ("27 Sep 2026 18:00 +0000"): esse formato
 * é lido à mão para não depender do motor de JavaScript do celular. Data ilegível vira "agora".
 */
export function toIso(raw: string): string {
  const s = raw.trim();
  // fuso por nome ("EDT") não casa aqui e fica com o Date.parse, que conhece os nomes
  const m = s.match(/^(?:[a-z]{3},?\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([+-])(\d{2}):?(\d{2})|GMT|UTC|UT|Z)?$/i);
  if (m && MONTHS[m[2].toLowerCase()] != null) {
    const offset = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0;
    const t = Date.UTC(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - offset * 60000;
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const t = s ? Date.parse(s) : NaN;
  return new Date(Number.isFinite(t) ? t : Date.now()).toISOString();
}

// manchete de post sem título (Bluesky, Mastodon): até ~110 caracteres, cortada entre palavras
const TITLE_MAX = 110;

/**
 * Título e resumo de um post: a primeira linha vira a manchete e o resto fica no resumo.
 * Linha longa demais termina na última frase que couber; sem frase, é cortada entre palavras
 * com reticências, e o resumo continua de onde a manchete parou.
 */
export function postTitle(body: string): { title: string; excerpt: string } {
  const lines = body.split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const rest = lines.slice(1).join(' ');
  if (first.length <= TITLE_MAX) return { title: first, excerpt: rest };
  const join = (a: string, b: string) => [a, b].filter(Boolean).join(' ');
  let end = -1;
  for (const m of first.matchAll(/[.!?…](?=\s)/g)) {
    if (m.index + 1 > TITLE_MAX) break;
    if (m.index + 1 >= 25) end = m.index + 1;
  }
  if (end > 0) return { title: first.slice(0, end), excerpt: join(first.slice(end).trim(), rest) };
  const cut = first.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(' ');
  const head = (space > 60 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '');
  return { title: `${head}…`, excerpt: join(`…${first.slice(head.length).trim()}`, rest) };
}

// texto de HTML com as quebras de parágrafo preservadas (para achar a primeira linha do post).
// Tag de linha (link, hashtag do Mastodon) sai sem espaço: "<a>#<span>chess</span></a>" vira "#chess"
const htmlLines = (html: string) =>
  decode(decode(html).replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ''));

export function parseFeed(xml: string, source: SourceId): FeedItem[] {
  const doc = parser.parse(xml);
  const rssItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const list: any[] = [rssItems ?? atomEntries ?? []].flat();

  const out: FeedItem[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const link = typeof it.link === 'string'
      ? it.link
      : [it.link].flat().find((l: any) => !l?.['@rel'] || l['@rel'] === 'alternate')?.['@href'] ?? '';
    const group = it['media:group'];
    const rawBody = text(it.description) || text(it.summary) || text(it['content:encoded']) || text(it.content) || text(group?.['media:description']);
    // Google Notícias: "Manchete - Veículo" e o resumo é só a manchete de novo
    const publisher = text(it.source) || undefined;
    let title = stripHtml(text(it.title));
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
    let excerpt = stripHtml(rawBody);
    if (publisher && excerpt.startsWith(title.slice(0, 30))) excerpt = '';
    // post de rede social não tem <title>: a manchete sai do começo do texto do post
    if (!title) ({ title, excerpt } = postTitle(htmlLines(rawBody)));
    // post só com vídeo ou foto, sem texto nenhum: não tem o que mostrar na lista
    if (!title) continue;
    const date = text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']);
    const url = String(link).trim();
    out.push({
      id: `${source}-${hash(url || text(it.title))}`,
      source,
      title,
      url,
      publishedAt: toIso(date),
      excerpt: excerpt.slice(0, 420),
      image: firstImage(mediaImage(it), rawBody, text(it['content:encoded']), text(it.content)),
      publisher,
    });
  }
  return out;
}

// rótulos de moderação que tiram o post da lista (conteúdo adulto ou pedido de não exibir)
const HIDDEN_LABELS = new Set(['!hide', '!warn', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore']);

/** Foto do post do Bluesky: fotos, card de link, capa do vídeo ou a mídia de uma citação. */
function bskyImage(embed: any): string | undefined {
  if (!embed || typeof embed !== 'object') return undefined;
  const img = Array.isArray(embed.images) ? embed.images.find((i: any) => typeof i?.thumb === 'string') : undefined;
  const pick = img?.thumb ?? embed.external?.thumb ?? embed.thumbnail;
  if (typeof pick === 'string' && /^https:/.test(pick)) return pick;
  return embed.media ? bskyImage(embed.media) : undefined;
}

/**
 * Posts de um perfil pela API pública do Bluesky (app.bsky.feed.getAuthorFeed), sem conta.
 * Pula repost, resposta e post rotulado. Perfil que pediu para não ser lido sem login
 * (rótulo !no-unauthenticated) não entra.
 */
export function parseBluesky(json: string, source: SourceId): FeedItem[] {
  const data = JSON.parse(json);
  const feed: any[] = Array.isArray(data?.feed) ? data.feed : [];
  const out: FeedItem[] = [];
  for (const entry of feed) {
    const post = entry?.post;
    if (!post || entry.reason || entry.reply || post.record?.reply) continue;
    const author = post.author ?? {};
    if ((author.labels ?? []).some((l: any) => l?.val === '!no-unauthenticated')) return [];
    if ((post.labels ?? []).some((l: any) => HIDDEN_LABELS.has(l?.val))) continue;
    const rkey = String(post.uri ?? '').split('/').pop();
    if (!rkey || !author.handle) continue;
    const external = post.embed?.external ?? post.embed?.media?.external;
    let { title, excerpt } = postTitle(String(post.record?.text ?? ''));
    // o card do link completa o resumo (e vira a manchete de post sem texto)
    const card = [external?.title, external?.description].filter((s) => typeof s === 'string' && s.trim()).join('. ');
    if (!title && card) ({ title, excerpt } = postTitle(card));
    else if (!excerpt) excerpt = card;
    if (!title) continue;
    const url = `https://bsky.app/profile/${author.handle}/post/${rkey}`;
    out.push({
      id: `${source}-${hash(url)}`,
      source,
      title,
      url,
      publishedAt: toIso(String(post.record?.createdAt ?? post.indexedAt ?? '')),
      excerpt: excerpt.slice(0, 420),
      image: bskyImage(post.embed),
    });
  }
  return out;
}

/** Lê a resposta de uma fonte: JSON da API do Bluesky ou RSS/Atom. */
export function parseSource(body: string, src: Source): FeedItem[] {
  return isBluesky(src.feed) ? parseBluesky(body, src.id) : parseFeed(body, src.id);
}

export async function fetchSource(src: Source, timeoutMs = 12000): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src.feed, { signal: ctrl.signal, headers: {
        Accept: isBluesky(src.feed) ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml',
        // alguns servidores recusam requisições sem User-Agent identificável
        'User-Agent': 'ChessCodexNews/0.1 (Android)',
      },
    });
    if (!res.ok) throw new Error(`${src.id}: HTTP ${res.status}`);
    return parseSource(await res.text(), src);
  } finally {
    clearTimeout(t);
  }
}

// atributo de uma tag HTML, em qualquer ordem e com aspas simples ou duplas
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

/**
 * Foto de capa da matéria, para feeds que não mandam imagem: og:image ou twitter:image (em qualquer
 * ordem de atributos, no <head> inteiro) e, sem elas, a imagem do JSON-LD da página.
 */
export async function fetchOgImage(url: string, timeoutMs = 8000): Promise<string | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' } });
    if (!res.ok) return undefined;
    const html = (await res.text()).slice(0, 400000);
    const end = html.search(/<\/head>/i);
    const head = end > 0 ? html.slice(0, end) : html.slice(0, 200000);
    const metas = (head.match(/<meta\b[^>]*>/gi) ?? []).map((m) => [(attr(m, 'property') ?? attr(m, 'name') ?? '').toLowerCase(), attr(m, 'content')] as const);
    const meta = (...keys: string[]) => keys.map((k) => metas.find(([key, c]) => key === k && c)?.[1]).find(Boolean);
    const found = meta('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src')
      // JSON-LD: "image":{"url":"..."}, "image":["..."] ou "image":"..."
      ?? html.match(/"image"\s*:\s*\{[^{}]*?"url"\s*:\s*"(https?:[^"]+)"/)?.[1]
      ?? html.match(/"image"\s*:\s*\[\s*"(https?:[^"]+)"/)?.[1]
      ?? html.match(/"image"\s*:\s*"(https?:[^"]+)"/)?.[1];
    if (!found) return undefined;
    const abs = new URL(decode(found).replace(/\\\//g, '/'), res.url || url).href;
    return abs.startsWith('https://') && !notPhoto(abs) ? abs : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
