export type SourceId =
  | 'chesscom' | 'lichess' | 'lichess-community' | 'chessbase' | 'fide' | 'reddit'
  | 'gnews-br' | 'gnews-players' | 'gnews-science'
  | 'gnews-local'
  | 'yt-gotham' | 'yt-hikaru' | 'yt-agadmator' | 'yt-chesscom' | 'yt-stlouis';

// jornal = redações de xadrez (aba Agora)
// geral = imprensa em geral via Google Notícias: vida dos jogadores, ciência, cultura (Radar)
// video = canais do YouTube (Radar) · comunidade = fórum e blogs (Radar)
export type SourceKind = 'jornal' | 'geral' | 'video' | 'comunidade';

export type Source = {
  id: SourceId;
  name: string;
  short: string;
  feed: string;
  color: string;
  kind: SourceKind;
};

const gnews = (q: string, lang: 'pt' | 'en') =>
  lang === 'pt'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const yt = (channel: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;

// Todos os feeds são públicos e gratuitos; o próprio celular faz o download.
export const SOURCES: Source[] = [
  { id: 'chesscom', name: 'Chess.com', short: 'Chess.com', feed: 'https://www.chess.com/rss/news', color: '#81B64C', kind: 'jornal' },
  { id: 'fide', name: 'FIDE', short: 'FIDE', feed: 'https://www.fide.com/feed', color: '#3B82F6', kind: 'jornal' },
  { id: 'chessbase', name: 'ChessBase', short: 'ChessBase', feed: 'https://en.chessbase.com/feed', color: '#E0493B', kind: 'jornal' },
  { id: 'lichess', name: 'Lichess', short: 'Lichess', feed: 'https://lichess.org/blog.atom', color: '#B9BEC8', kind: 'jornal' },

  { id: 'gnews-br', name: 'Imprensa brasileira', short: 'Imprensa BR', feed: gnews('xadrez OR enxadrista when:7d', 'pt'), color: '#22C55E', kind: 'geral' },
  { id: 'gnews-players', name: 'Imprensa: jogadores', short: 'Imprensa', feed: gnews('"Magnus Carlsen" OR "Hikaru Nakamura" OR Gukesh OR "Fabiano Caruana" OR "Alireza Firouzja" OR "Hans Niemann" OR Kramnik when:3d', 'en'), color: '#A78BFA', kind: 'geral' },
  { id: 'gnews-science', name: 'Ciência e cultura', short: 'Ciência', feed: gnews('chess (study OR science OR brain OR research OR AI OR history) when:14d', 'en'), color: '#06B6D4', kind: 'geral' },

  { id: 'yt-gotham', name: 'GothamChess', short: 'GothamChess', feed: yt('UCQHX6ViZmPsWiYSFAyS0a3Q'), color: '#FF3B30', kind: 'video' },
  { id: 'yt-hikaru', name: 'GMHikaru', short: 'Hikaru', feed: yt('UCweCc7bSMX5J4jEH7HFImng'), color: '#FF3B30', kind: 'video' },
  { id: 'yt-agadmator', name: 'agadmator', short: 'agadmator', feed: yt('UCL5YbN5WLFD8dLIegT5QAbA'), color: '#FF3B30', kind: 'video' },
  { id: 'yt-chesscom', name: 'Chess.com (YouTube)', short: 'Chess.com TV', feed: yt('UC5kS0l76kC0xOzMPtOmSFGw'), color: '#FF3B30', kind: 'video' },
  { id: 'yt-stlouis', name: 'Saint Louis Chess Club', short: 'Saint Louis', feed: yt('UCM-ONC2bCHytG2mYtKDmIeA'), color: '#FF3B30', kind: 'video' },

  { id: 'lichess-community', name: 'Blogs do Lichess', short: 'Comunidade', feed: 'https://lichess.org/blog/community.atom', color: '#E3A04A', kind: 'comunidade' },
  { id: 'reddit', name: 'r/chess', short: 'r/chess', feed: 'https://www.reddit.com/r/chess/.rss', color: '#FF5A1F', kind: 'comunidade' },
];

// Notícias da região do leitor: montada no aparelho a partir da cidade/estado dos Ajustes
export function localSource(region: string): Source {
  return { id: 'gnews-local', name: `Xadrez em ${region}`, short: 'Sua região', feed: gnews(`xadrez "${region}" when:30d`, 'pt'), color: '#F59E0B', kind: 'geral' };
}

const LOCAL = localSource('');
export const sourceById = (id: SourceId) => SOURCES.find((s) => s.id === id) ?? LOCAL;
