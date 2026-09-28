export type SourceId =
  | 'chesscom' | 'lichess' | 'lichess-community' | 'chessbase' | 'fide'
  | 'chesscom-pt' | 'fmx' | 'fexpar' | 'xadrezdiario'
  | 'damasyreyes' | 'elpais' | 'feda' | 'latitudsur'
  | 'ecu' | 'stlcc' | 'sportstar' | 'guardian'
  | 'gnews-br' | 'gnews-players' | 'gnews-science'
  | 'gnews-local'
  | 'yt-gotham' | 'yt-hikaru' | 'yt-agadmator' | 'yt-chesscom' | 'yt-stlouis'
  | 'yt-supi' | 'yt-raffael' | 'yt-krikor' | 'yt-xadrezbrasil' | 'yt-leitao' | 'yt-evandro'
  | 'yt-cbx' | 'yt-chesscompt' | 'yt-alboredo' | 'yt-xadreztotal'
  | 'fbx-ba' | 'fexeg' | 'fbx-df' | 'lbx' | 'blogesporte' | 'pbesportes' | 'xadrez-pelotas' | 'xadrez-pirai'
  | 'bsky-chesscompt' | 'bsky-leontxo' | 'bsky-chess24' | 'bsky-europeechecs'
  | 'bsky-lichess' | 'masto-olympus';

// jornal = redações de xadrez e entidades oficiais (Hoje, nas histórias e nas Notícias do dia)
// geral = imprensa em geral (Google Notícias e seções de xadrez de jornais): Hoje e Radar
// video = canais do YouTube (Radar) · comunidade = fórum e blogs (Radar)
// social = perfis públicos no Bluesky e no Mastodon (só no Radar, filtro "Redes"; nunca viram história)
export type SourceKind = 'jornal' | 'geral' | 'video' | 'comunidade' | 'social';

export type Source = {
  id: SourceId;
  name: string;
  short: string;
  feed: string;
  color: string;
  kind: SourceKind;
  // idioma do feed: o robô não traduz de novo o que já chega em português
  lang: 'pt' | 'es' | 'en' | 'fr';
};

const gnews = (q: string, lang: 'pt' | 'en') =>
  lang === 'pt'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const yt = (channel: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;

// Bluesky: API pública, sem conta nem chave. O RSS do Bluesky não traz título nem foto; a API traz
// as fotos e o card do link. O perfil entra pelo DID, que continua valendo se o dono trocar o @.
const BSKY_API ='https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const bsky = (did: string) => `${BSKY_API}?actor=${did}&filter=posts_no_replies&limit=15`;

const BLUESKY = '#1185FE';
const MASTODON = '#6364FF';

// Todos os feeds são públicos e gratuitos; o próprio celular faz o download.
export const SOURCES: Source[] = [
  { id: 'chesscom', name: 'Chess.com', short: 'Chess.com', feed: 'https://www.chess.com/rss/news', color: '#81B64C', kind: 'jornal', lang: 'en' },
  { id: 'chesscom-pt', name: 'Chess.com em Português', short: 'Chess.com PT', feed: 'https://www.chess.com/pt-BR/rss/news', color: '#81B64C', kind: 'jornal', lang: 'pt' },
  { id: 'fide', name: 'FIDE', short: 'FIDE', feed: 'https://www.fide.com/feed', color: '#3B82F6', kind: 'jornal', lang: 'en' },
  { id: 'chessbase', name: 'ChessBase', short: 'ChessBase', feed: 'https://en.chessbase.com/feed', color: '#E0493B', kind: 'jornal', lang: 'en' },
  { id: 'lichess', name: 'Lichess', short: 'Lichess', feed: 'https://lichess.org/blog.atom', color: '#B9BEC8', kind: 'jornal', lang: 'en' },
  { id: 'fmx', name: 'Federação Mineira de Xadrez', short: 'FMX', feed: 'https://fmx.org.br/feed/', color: '#F2C27A', kind: 'jornal', lang: 'pt' },
  { id: 'fexpar', name: 'Federação de Xadrez do Paraná', short: 'FEXPAR', feed: 'https://fexpar.com.br/feed/', color: '#2DD4BF', kind: 'jornal', lang: 'pt' },
  { id: 'feda', name: 'Federación Española de Ajedrez', short: 'FEDA', feed: 'https://feda.org/feda2k16/feed/', color: '#FACC15', kind: 'jornal', lang: 'es' },
  { id: 'ecu', name: 'European Chess Union', short: 'ECU', feed: 'https://www.europechess.org/feed/', color: '#818CF8', kind: 'jornal', lang: 'en' },
  { id: 'damasyreyes', name: 'Damas y Reyes', short: 'Damas y Reyes', feed: 'https://damasyreyes.es/feed/', color: '#F43F5E', kind: 'jornal', lang: 'es' },
  { id: 'stlcc', name: 'Saint Louis Chess Club · notícias', short: 'Saint Louis', feed: 'https://saintlouischessclub.org/feed/', color: '#E879F9', kind: 'jornal', lang: 'en' },

  { id: 'gnews-br', name: 'Imprensa brasileira', short: 'Imprensa BR', feed: gnews('xadrez OR enxadrista when:7d', 'pt'), color: '#22C55E', kind: 'geral', lang: 'pt' },
  { id: 'gnews-players', name: 'Imprensa: jogadores', short: 'Imprensa', feed: gnews('"Magnus Carlsen" OR "Hikaru Nakamura" OR Gukesh OR "Fabiano Caruana" OR "Alireza Firouzja" OR "Hans Niemann" OR Kramnik when:3d', 'en'), color: '#A78BFA', kind: 'geral', lang: 'en' },
  { id: 'gnews-science', name: 'Ciência e cultura', short: 'Ciência', feed: gnews('chess (study OR science OR brain OR research OR AI OR history) when:14d', 'en'), color: '#06B6D4', kind: 'geral', lang: 'en' },
  // seções de xadrez de jornais: ao contrário do Google Notícias, o feed já vem com foto
  { id: 'elpais', name: 'El País · Ajedrez', short: 'El País', feed: 'https://feeds.elpais.com/mrss-s/list/ep/site/elpais.com/tag/ajedrez_a', color: '#64748B', kind: 'geral', lang: 'es' },
  { id: 'guardian', name: 'The Guardian · Chess', short: 'Guardian', feed: 'https://www.theguardian.com/sport/chess/rss', color: '#38BDF8', kind: 'geral', lang: 'en' },
  { id: 'sportstar', name: 'Sportstar (The Hindu)', short: 'Sportstar', feed: 'https://sportstar.thehindu.com/chess/feeder/default.rss', color: '#F87171', kind: 'geral', lang: 'en' },

  { id: 'yt-gotham', name: 'GothamChess', short: 'GothamChess', feed: yt('UCQHX6ViZmPsWiYSFAyS0a3Q'), color: '#FF3B30', kind: 'video', lang: 'en' },
  { id: 'yt-hikaru', name: 'GMHikaru', short: 'Hikaru', feed: yt('UCweCc7bSMX5J4jEH7HFImng'), color: '#FF3B30', kind: 'video', lang: 'en' },
  { id: 'yt-agadmator', name: 'agadmator', short: 'agadmator', feed: yt('UCL5YbN5WLFD8dLIegT5QAbA'), color: '#FF3B30', kind: 'video', lang: 'en' },
  { id: 'yt-chesscom', name: 'Chess.com (YouTube)', short: 'Chess.com TV', feed: yt('UC5kS0l76kC0xOzMPtOmSFGw'), color: '#FF3B30', kind: 'video', lang: 'en' },
  { id: 'yt-stlouis', name: 'Saint Louis Chess Club', short: 'Saint Louis', feed: yt('UCM-ONC2bCHytG2mYtKDmIeA'), color: '#FF3B30', kind: 'video', lang: 'en' },
  // canais brasileiros (IDs conferidos na página de cada canal em 28/09/2026)
  { id: 'yt-supi', name: 'GM Luis Paulo Supi', short: 'Supi', feed: yt('UCpiJhNVDJoKDhShQeC7tN4A'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-raffael', name: 'Raffael Chess', short: 'Raffael Chess', feed: yt('UCSAo4zvM1oAJ_i4C6q6ejBA'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-krikor', name: 'GM Krikor', short: 'Krikor', feed: yt('UCwWm-fABiYbcL7ro8qONd6Q'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-xadrezbrasil', name: 'Xadrez Brasil', short: 'Xadrez Brasil', feed: yt('UC5K-TQsItHnNLjqYf8A3CTw'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-leitao', name: 'GM Rafael Leitão', short: 'Rafael Leitão', feed: yt('UCistQmaDouEpKROBZBkQQ9A'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-evandro', name: 'GM Evandro Barbosa', short: 'Evandro Barbosa', feed: yt('UCUccuEMBFvbl01u_h8jitVg'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-cbx', name: 'CBX News', short: 'CBX', feed: yt('UC9rgc6_2iqy9EyH0nLAqDMA'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-chesscompt', name: 'Chess.com Português (YouTube)', short: 'Chess.com PT TV', feed: yt('UCF4rlw_pDM5AUxwXzseP2vQ'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-alboredo', name: 'MF Julia Alboredo', short: 'Julia Alboredo', feed: yt('UCvJstUz_kPRKZwug_SZzQ3A'), color: '#FF3B30', kind: 'video', lang: 'pt' },
  { id: 'yt-xadreztotal', name: 'Xadrez Total', short: 'Xadrez Total', feed: yt('UCl0pW-vG9r8AT8N2bJdMu8Q'), color: '#FF3B30', kind: 'video', lang: 'pt' },

  { id: 'lichess-community', name: 'Blogs do Lichess', short: 'Comunidade', feed: 'https://lichess.org/blog/community.atom', color: '#E3A04A', kind: 'comunidade', lang: 'en' },
  // o Blogger aceita max-results: sem ele, o feed passa de 500 KB
  { id: 'xadrezdiario', name: 'Xadrez Diário', short: 'Xadrez Diário', feed: 'https://www.xadrezdiario.com/feeds/posts/default?alt=rss&max-results=10', color: '#FB923C', kind: 'comunidade', lang: 'pt' },
  // Brasil: liga, federações, imprensa regional e blogs (feeds testados em 28/09/2026), no Radar
  { id: 'lbx', name: 'Liga Brasileira de Xadrez', short: 'LBX', feed: 'https://lbx.org.br/feed/', color: '#22C55E', kind: 'comunidade', lang: 'pt' },
  { id: 'fbx-ba', name: 'Federação Bahiana de Xadrez', short: 'FBX Bahia', feed: 'https://fbxbahia.org/feed/', color: '#FBBF24', kind: 'comunidade', lang: 'pt' },
  { id: 'fexeg', name: 'Federação de Xadrez de Goiás', short: 'FEXEG', feed: 'https://fexeg.com/feed/', color: '#34D399', kind: 'comunidade', lang: 'pt' },
  { id: 'fbx-df', name: 'Federação Brasiliense de Xadrez', short: 'FBX DF', feed: 'https://fbx.org.br/feed/', color: '#60A5FA', kind: 'comunidade', lang: 'pt' },
  { id: 'blogesporte', name: 'Blog Esporte · Xadrez', short: 'Blog Esporte', feed: 'https://blogesporte.com.br/category/xadrez/feed/', color: '#F97316', kind: 'comunidade', lang: 'pt' },
  { id: 'pbesportes', name: 'PB Esportes · Xadrez', short: 'PB Esportes', feed: 'https://pbesportes.net/category/xadrez/feed/', color: '#A78BFA', kind: 'comunidade', lang: 'pt' },
  { id: 'xadrez-pelotas', name: 'Xadrez em Pelotas', short: 'Xadrez Pelotas', feed: 'https://xadrezempelotas.blogspot.com/feeds/posts/default?alt=rss&max-results=10', color: '#F472B6', kind: 'comunidade', lang: 'pt' },
  { id: 'xadrez-pirai', name: 'Xadrez Piraí', short: 'Xadrez Piraí', feed: 'https://xadrezpirai.blogspot.com/feeds/posts/default?alt=rss&max-results=10', color: '#2DD4BF', kind: 'comunidade', lang: 'pt' },
  { id: 'latitudsur', name: 'Ajedrez Latitud Sur', short: 'Latitud Sur', feed: 'https://ajedrezlatitudsur.wordpress.com/feed/', color: '#A3E635', kind: 'comunidade', lang: 'es' },

  // Redes: X e Instagram não têm leitura pública sem conta e sem plano pago; Bluesky e Mastodon têm.
  { id: 'bsky-chesscompt', name: 'Chess.com em Português (Bluesky)', short: '@chesscompt', feed: bsky('did:plc:q22jc7a6hxr6rau4wzshqjk6'), color: BLUESKY, kind: 'social', lang: 'pt' },
  { id: 'bsky-leontxo', name: 'Leontxo García (Bluesky)', short: '@leontxogarcia', feed: bsky('did:plc:4cpyxynw3fdze3xy3rmnpxn4'), color: BLUESKY, kind: 'social', lang: 'es' },
  { id: 'bsky-chess24', name: 'chess24 (Bluesky)', short: '@chess24', feed: bsky('did:plc:nrvxixegotctyfmobur4slyc'), color: BLUESKY, kind: 'social', lang: 'en' },
  { id: 'bsky-europeechecs', name: 'Europe Échecs (Bluesky)', short: '@europe-echecs', feed: bsky('did:plc:zomv2hjiuuhynrtaydgo6co5'), color: BLUESKY, kind: 'social', lang: 'fr' },
  // o Lichess publica o mesmo no Mastodon, mas lá o RSS traz cada pedaço do fio (até crédito de foto);
  // a API do Bluesky entrega só os posts principais
  { id: 'bsky-lichess', name: 'Lichess (Bluesky)', short: '@lichess', feed: bsky('did:plc:3mnwuwrawex3yj2gwtyi2nfv'), color: BLUESKY, kind: 'social', lang: 'en' },
  // Mastodon: o RSS do perfil já vem com a foto
  { id: 'masto-olympus', name: 'Chess Olympus (Mastodon)', short: '@Chess_Olympus', feed: 'https://mastodon.online/@Chess_Olympus.rss', color: MASTODON, kind: 'social', lang: 'en' },
];

// Notícias da região do leitor: montada no aparelho a partir da cidade/estado dos Ajustes
export function localSource(region: string): Source {
  return { id: 'gnews-local', name: `Xadrez em ${region}`, short: 'Sua região', feed: gnews(`xadrez "${region}" when:30d`, 'pt'), color: '#F59E0B', kind: 'geral', lang: 'pt' };
}

const LOCAL = localSource('');
export const sourceById = (id: SourceId) => SOURCES.find((s) => s.id === id) ?? LOCAL;

const KNOWN = new Set<string>([...SOURCES.map((s) => s.id), LOCAL.id]);
/** Fonte que existe nesta versão do app. Item de fonte removida (cache ou digest antigo) fica de fora. */
export const isKnownSource = (id: string): id is SourceId => KNOWN.has(id);
/**
 * Mesmo teste pelo id do item ("chesscom-pt-1ab2" começa pelo id da fonte), para o que só aparece
 * pelo id: história da edição anterior que o robô manteve, com itens que já saíram do feed.
 */
export const isKnownItemId = (id: unknown): boolean =>
  typeof id === 'string' && [...KNOWN].some((s) => id.startsWith(`${s}-`));

/**
 * Vale buscar a og:image da matéria quando o feed vem sem foto? Não para vídeo (o YouTube já manda),
 * rede social (a página do post devolve o avatar) e Google Notícias (o link é do Google, não do veículo).
 */
export function wantsOgImage(id: SourceId): boolean {
  const s = sourceById(id);
  return s.kind !== 'video' && s.kind !== 'social' && !s.feed.startsWith('https://news.google.com/');
}
