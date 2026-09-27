import type { SourceId } from './sources';

// Micro-artigo: o meio-termo entre o artigo longo do Chess.com e o post de blog do Lichess.
// Leitura de ~90s: manchete, 3 fatos, contexto ("por que importa"), números, lance-chave
// no tabuleiro e links pra cobertura de cada fonte.
export type MicroArticle = {
  id: string;
  kicker: string;
  title: string;
  // Manchete sem resultado, usada no Modo Anti-Spoiler
  safeTitle: string;
  dek: string;
  // foto de capa, sempre da própria fonte citada em coverage
  image?: string;
  bullets?: string[];
  // "O que aconteceu" em texto corrido (2 a 3 parágrafos), escrito pelo robô e checado nas fontes
  body?: string[];
  // o que cada fonte disse (histórias do robô): nada escrito além do resumo de cada fonte.
  // checked = resumo conferido contra a fonte; sem isso, a página mostra a manchete da fonte
  points?: { source: SourceId; publisher?: string; text: string; url: string; checked?: boolean }[];
  context?: string;
  stats?: { label: string; value: string }[];
  // partida ligada à notícia; sem caption, a legenda é calculada a partir da posição decisiva
  game?: { key: string; ply?: number; caption?: string };
  coverage: { source: SourceId; title: string; url: string }[];
  tag: 'Torneios' | 'Jogadores' | 'Plataformas' | 'Bastidores';
  minutes: number;
  publishedAt: string;
  spoiler: boolean;
};

export type Edition = {
  id: string;
  label: 'Manhã' | 'Tarde' | 'Noite';
  date: string;
  intro: string;
  articles: MicroArticle[];
};

// Edição de exemplo montada com as notícias reais de 25/09/2026.
// Em produção vira um JSON publicado de graça (GitHub Pages) e baixado pelo app.
export const EDITION: Edition = {
  id: '2026-09-25-noite',
  label: 'Noite',
  date: '2026-09-25T21:00:00-03:00',
  intro: 'Uzbequistão dispara na Olimpíada, Gukesh salva a Índia de posição perdida e uma menina de 11 anos vira WGM.',
  articles: [
    {
      id: 'olimpiada-r9',
      image: 'https://www.fide.com/wp-content/uploads/Olympiad-D09-Uzbekistan-USA.jpg',
      kicker: 'Olimpíada · Rodada 9',
      title: 'Uzbequistão vence os EUA e fica sozinho na liderança',
      safeTitle: 'Uzbequistão × EUA: o confronto que mexeu na tabela da Olimpíada',
      dek: 'Abdusattorov derrota Caruana no 1º tabuleiro; Wesley So devolve contra Sindarov, mas não basta.',
      bullets: [
        'Uzbequistão soma 16/18 pontos de match, um à frente de Índia, Uzbequistão 2 e Armênia.',
        'Nodirbek Abdusattorov bateu Fabiano Caruana com as brancas e decidiu o duelo contra a cabeça de chave.',
        'No feminino, a China lidera sozinha com 17/18, dois pontos à frente de Índia, Cazaquistão e Mongólia.',
      ],
      context:
        'Faltam duas rodadas. O Uzbequistão, campeão em 2022, joga em casa e depende só de si. A derrota em casa para a Alemanha na rodada 8 tinha reaberto a disputa; a vitória sobre os EUA, favoritos no papel, fecha a porta de novo.',
      stats: [
        { label: 'Pontos de match', value: '16/18' },
        { label: 'Rodadas restantes', value: '2' },
        { label: 'Equipes no aberto', value: '208' },
      ],
      game: { key: 'abdusattorov-caruana', caption: 'O lance que decidiu: Caruana captura em b3 e a avaliação salta de +1,2 para +4,7.' },
      coverage: [
        { source: 'chesscom', title: 'Uzbekistan Beats U.S. To Take Sole Lead', url: 'https://www.chess.com/news/view/2026-samarkand-chess-olympiad-round-9' },
        { source: 'lichess', title: 'Rounds 7–9: Uzbekistan & China Lead', url: 'https://lichess.org/@/Lichess/blog/2026-samarkand-olympiad-rounds-7-9-uzbekistan-china-lead-open-and-womens/MF1Hjp6Z' },
        { source: 'fide', title: 'Uzbekistan takes a giant step towards gold', url: 'https://www.fide.com/olympiad-day-9-uzbekistan-takes-a-giant-step-towards-gold/' },
      ],
      tag: 'Torneios',
      minutes: 2,
      publishedAt: '2026-09-25T16:45:00Z',
      spoiler: true,
    },
    {
      id: 'gukesh-donchenko',
      kicker: 'Olimpíada · Índia 2,5 × 1,5 Alemanha',
      title: 'Gukesh vira partida perdida e salva a Índia',
      safeTitle: 'Gukesh × Donchenko: a partida mais comentada do dia',
      dek: 'De pretas, Gukesh viu o motor marcar +3,9 para as brancas e ainda assim venceu.',
      bullets: [
        'Com as brancas, Donchenko chegou a +3,9 na avaliação do motor, perto do lance 45.',
        'Gukesh complicou com …h3 e as brancas erraram o caminho; a vantagem evaporou em três lances.',
        'Com a vitória, a Índia venceu a Alemanha por 2,5 × 1,5 e segue a um ponto da liderança.',
      ],
      context:
        'É o tipo de partida que o motor chama de "perdida" e o torcedor chama de lenda. A Alemanha tinha sido a única equipe a vencer o Uzbequistão; tirar pontos dela mantém a Índia viva na briga pelo ouro.',
      stats: [
        { label: 'Pior avaliação', value: '+3,9' },
        { label: 'Lances', value: '54' },
        { label: 'Placar do match', value: '2,5–1,5' },
      ],
      game: { key: 'donchenko-gukeshd', ply: 90, caption: 'Brancas +3,9. Aqui Donchenko joga Tee3 e a vantagem começa a sumir.' },
      coverage: [
        { source: 'chesscom', title: 'Uzbekistan Beats U.S. To Take Sole Lead', url: 'https://www.chess.com/news/view/2026-samarkand-chess-olympiad-round-9' },
        { source: 'fide', title: 'Olympiad Day 9', url: 'https://www.fide.com/olympiad-day-9-uzbekistan-takes-a-giant-step-towards-gold/' },
      ],
      tag: 'Jogadores',
      minutes: 2,
      publishedAt: '2026-09-25T15:31:00Z',
      spoiler: true,
    },
    {
      id: 'so-sindarov',
      kicker: 'Olimpíada · Tabuleiro 2',
      title: 'Wesley So derruba o desafiante ao título mundial',
      safeTitle: 'So × Sindarov: o duelo do tabuleiro 2',
      dek: 'Sindarov, que disputa o título mundial, errou no final e o americano converteu.',
      bullets: [
        'Javokhir Sindarov é o desafiante ao título mundial e joga pelo time da casa.',
        'A partida seguiu sob controle até o lance 39, quando …Tc2 levou a avaliação de +1,4 a +5,6.',
        'O ponto de So não evitou a derrota dos EUA no confronto.',
      ],
      context:
        'Sindarov chega ao match pelo título mundial sob holofote. Uma derrota com as pretas em casa não muda o favoritismo, mas vai alimentar a discussão sobre sua forma nos finais.',
      game: { key: 'so-sindarov', caption: 'Posição antes de …Tc2, o erro que decidiu a partida.' },
      coverage: [
        { source: 'chesscom', title: 'Uzbekistan Beats U.S. To Take Sole Lead', url: 'https://www.chess.com/news/view/2026-samarkand-chess-olympiad-round-9' },
      ],
      tag: 'Jogadores',
      minutes: 1,
      publishedAt: '2026-09-25T14:39:00Z',
      spoiler: true,
    },
    {
      id: 'bodhana-wgm',
      image: 'https://en.chessbase.com/thumb/132469_l200',
      kicker: 'Jogadores',
      title: 'Bodhana Sivanandan, 11 anos, garante o título de WGM',
      safeTitle: 'Bodhana Sivanandan e a terceira norma de WGM',
      dek: 'O empate contra Mai Narva fechou a terceira e última norma da inglesa.',
      bullets: [
        'Bodhana joga pela Inglaterra e completou a terceira norma de Grande Mestra Feminina na Olimpíada.',
        'O título ainda precisa ser confirmado pela FIDE.',
        'A ChessBase publicou nesta semana um perfil sobre ela e seus outros interesses.',
      ],
      context:
        'Normas de título exigem desempenho alto contra adversárias tituladas em torneios fortes. Fechar as três antes dos 12 anos coloca Bodhana entre as mais precoces da história do xadrez feminino.',
      coverage: [
        { source: 'chessbase', title: 'Bodhana Sivanandan: Chess and other passions', url: 'https://en.chessbase.com/post/bodhana-sivanandan-chess-and-other-passions' },
      ],
      tag: 'Jogadores',
      minutes: 1,
      publishedAt: '2026-09-25T15:01:00Z',
      spoiler: false,
    },
    {
      id: '3-0-thursday',
      image: 'https://images.chesscomfiles.com/uploads/v1/news/2198971.d41b1b36.5000x5000o.dfdd35e259a4.png',
      kicker: 'Online · 3+0 Thursday',
      title: 'Carlsen leva o 3+0 Thursday no desempate',
      safeTitle: 'Carlsen e Nakamura no 3+0 Thursday',
      dek: 'Fora da Olimpíada, Magnus e Hikaru dividiram a ponta; Minh Le ficou pelo caminho.',
      bullets: [
        'Carlsen e Nakamura terminaram empatados no topo; Magnus ficou com o 1º lugar nos critérios.',
        'Segundo o Chess.com, um clique errado (mouse slip) ajudou Carlsen na reta final.',
        'Maghsoodloo e Ashraf também saíram vitoriosos; Minh Le ficou perto e perdeu no fim.',
      ],
      context:
        'O novo torneio semanal de blitz 3+0 do Chess.com estreou nesta quinta. Com a elite na Olimpíada, os dois maiores nomes do online dominaram o evento.',
      coverage: [
        { source: 'chesscom', title: 'Heartbreak For Minh Le, Victories For Carlsen…', url: 'https://www.chess.com/news/view/carlsen-maghsoodloo-ashraf-3-0-thursday-09-24-2026' },
      ],
      tag: 'Plataformas',
      minutes: 1,
      publishedAt: '2026-09-25T16:42:41Z',
      spoiler: true,
    },
    {
      id: 'lichess-streamer-arenas',
      image: 'https://image.lichess1.org/display?fmt=webp&h=550&op=thumbnail&path=tPDH5Yk3Plqa.webp&w=880&sig=97a31ea5a67b4dd6d62293c9e8feb20af968e9b0',
      kicker: 'Lichess',
      title: 'Lichess divulga as Streamer Arenas até dezembro',
      safeTitle: 'Lichess divulga as Streamer Arenas até dezembro',
      dek: 'Calendário de arenas com streamers vai de agosto a dezembro de 2026.',
      bullets: [
        'O calendário traz arenas com streamers até dezembro.',
        'O Lichess também publicou o balanço do semestre: app, site, transmissões e eventos.',
        'Tudo gratuito e sem anúncios, como sempre no Lichess.',
      ],
      context:
        'Enquanto o Chess.com aposta em torneios com premiação, o Lichess cresce com eventos comunitários. É a diferença de modelo entre as duas plataformas.',
      coverage: [
        { source: 'lichess', title: 'Streamer Arenas Announcement', url: 'https://lichess.org/@/Lichess/blog/streamer-arenas-announcement-august-to-december-2026/tkby72bI' },
        { source: 'lichess', title: 'More Than a Half-Year Update 2026', url: 'https://lichess.org/@/Lichess/blog/more-than-a-half-year-update-2026/Bu77Rba1' },
      ],
      tag: 'Plataformas',
      minutes: 1,
      publishedAt: '2026-08-16T19:40:30Z',
      spoiler: false,
    },
  ],
};
