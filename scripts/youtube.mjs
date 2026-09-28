// Vídeos dos canais pela API oficial do YouTube (Data API v3): o RSS de canal do YouTube saiu do
// ar (404/500 para qualquer canal desde set/2026). Chave grátis do Google Cloud em YOUTUBE_API_KEY;
// cada canal custa 1 unidade da cota de 10 mil por dia (playlistItems da playlist de envios).
// Sem chave, os canais ficam de fora sem erro.

const API = 'https://www.googleapis.com/youtube/v3/playlistItems';

/** Canal (UC...) tirado do endereço do feed antigo em src/data/sources.ts. */
export const channelOf = (feed) => feed.match(/channel_id=(UC[\w-]{22})/)?.[1] ?? null;

/** Últimos vídeos do canal no formato FeedItem do app. */
// 15: com os Shorts filtrados, sobram os vídeos longos mais recentes
export async function fetchYouTube(src, key, max = 15) {
  const channel = channelOf(src.feed);
  if (!channel) throw new Error('canal sem channel_id');
  // a playlist de envios do canal é o mesmo id com UU no lugar de UC
  const url = `${API}?part=snippet&maxResults=${max}&playlistId=UU${channel.slice(2)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  // a mensagem nunca leva o endereço: ele tem a chave
  if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
  const data = await res.json();
  return (data.items ?? [])
    .map((v) => v.snippet)
    .filter((s) => s?.resourceId?.videoId && s.title && s.title !== 'Private video' && s.title !== 'Deleted video')
    // Shorts (título com #shorts ou cheio de hashtags) ficam de fora: o Radar fica com os vídeos de verdade
    .filter((s) => !/#shorts/i.test(s.title) && (s.title.match(/#\w/g) ?? []).length < 2)
    .map((s) => ({
      id: `${src.id}-${s.resourceId.videoId}`,
      source: src.id,
      title: s.title,
      url: `https://www.youtube.com/watch?v=${s.resourceId.videoId}`,
      publishedAt: new Date(s.publishedAt).toISOString(),
      excerpt: String(s.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
      image: s.thumbnails?.high?.url ?? s.thumbnails?.medium?.url ?? s.thumbnails?.default?.url,
    }));
}
