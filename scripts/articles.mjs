// Texto das matérias: baixa a página original e separa só os parágrafos da notícia
// (sem menu, rodapé, legenda de foto ou aviso de cookies). Serve de base para o resumo
// que a IA escreve e para a checagem frase a frase. Nada aqui usa IA.
const UA = { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' };
// texto extraído: serve para medir a matéria e conferir se ela bate com o feed. A IA recebe só o
// trecho essencial (essentials), que é o que pesa na cota de tokens
const MAX_CHARS = 6000;
// trecho mandado para escrever e checar o resumo: o começo da matéria concentra os fatos
export const ESSENTIAL_CHARS = 3500;
const MIN_PARAGRAPH = 60; // parágrafo curto costuma ser botão, crédito ou legenda

// Blocos que nunca são a matéria. Embeds de redes sociais também saem: são citações soltas com @, data e link.
const DROP_TAGS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'aside', 'figure', 'form', 'button', 'select'];

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•', deg: '°', times: '×', minus: '−',
  frac12: '½', frac14: '¼', frac34: '¾', half: '½', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è', ograve: 'ò',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ntilde: 'ñ',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', szlig: 'ß', oslash: 'ø', aring: 'å', scaron: 'š', ccaron: 'č', zcaron: 'ž',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Agrave: 'À', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç', Ntilde: 'Ñ', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', Oslash: 'Ø', Aring: 'Å', Scaron: 'Š', Zcaron: 'Ž',
};

// uma passada só: "&amp;lt;" vira "&lt;" e não "<" (texto que fala de HTML continua certo)
function decode(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Linhas que aparecem dentro do corpo mas não são notícia
const BOILERPLATE = [
  /\bcookies?\b/i,
  /newsletter/i,
  /^(photos?|images?|fotos?|imagem|credits?|créditos?|source|fonte)\s*[:|]/i,
  /\b(photo|image|foto)s?\s*(credit|courtesy|by|:)/i,
  /\bsubscribe\b|\bassine\b|\binscreva-se\b/i,
  /\ball rights reserved\b|©/i,
  /\b(sign up|log ?in|download (our|the) app|follow us|share this|click here)\b/i,
  /\bsocial media (channels|accounts)\b|\bredes sociais\b/i,
  // avisos da própria redação ("os links estão no nosso artigo de prévia", "entrevistas embutidas neste post")
  /\b(can be found|are available) (in|on) our\b|\bembedded throughout\b/i,
  /^(read more|see also|related|also read|leia (também|mais))\b/i,
  /\bvia (getty|shutterstock|reuters|afp)\b/i,
];

// Remove o bloco inteiro de cada tag, começando pelos mais internos (aguenta <nav> dentro de <nav>)
function dropBlocks(html, tag) {
  const inner = new RegExp('<' + tag + '(?=[\\s>/])[^>]*>(?:(?!<' + tag + '(?=[\\s>/]))[\\s\\S])*?</' + tag + '\\s*>', 'gi');
  let prev;
  do {
    prev = html;
    html = html.replace(inner, ' ');
  } while (html !== prev);
  return html;
}

// tag de texto some sem deixar espaço ("<b>Carlsen</b>," não vira "Carlsen ,"); as outras viram espaço
const clean = (fragment) =>
  decode(
    fragment
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(?:a|b|strong|i|em|span|u|small|sup|sub|mark|abbr|cite|code|time|font)(?=[\s>/])[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .trim();
const isGood = (p) => p.length > MIN_PARAGRAPH && !BOILERPLATE.some((re) => re.test(p));
// parágrafo que é quase só link é chamada para outra matéria, não texto desta
const linkText = (fragment) => (fragment.match(/<a(?=[\s>])[\s\S]*?<\/a\s*>/gi) ?? []).map(clean).join('').length;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// tags de texto não contam como "bloco" (o bloco é o div/section que junta os parágrafos)
const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'span', 'u', 'small', 'sup', 'sub', 'mark', 'abbr', 'cite', 'code', 'time', 'font', 'label']);
// bloco que abre dentro de um <p> fecha o <p>, como no navegador (a ChessBase põe anúncio em <P><div>)
const BLOCK = new Set(['div', 'section', 'article', 'main', 'ul', 'ol', 'dl', 'table', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'address', 'fieldset', 'details']);
// Blocos de loja, anúncio, comentários etc. pela classe/id. O próprio <main>/<article> nunca é descartado.
// "menu" fica de fora: o Lichess chama o bloco da matéria de "page-menu__content" (e <nav> já saiu).
const JUNK = /(^|[\s_-])(ads?|advert\w*|cbads\w*|banner|breadcrumbs?|comments?|cookies?|disqus|newsletter|popup|products?|promo\w*|related|share|shop\w*|sidebar|social|sponsor\w*|subscribe)($|[\s_-])/i;
const KEEP = new Set(['main', 'article', 'body', 'html']);
const classAndId = (attrs) => [...attrs.matchAll(/\b(?:class|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((a) => a[1] ?? a[2] ?? a[3]).join(' ');

// Lê as tags em ordem e anota, para cada <p>, a cadeia de blocos em que ele está.
function paragraphsWithAncestors(html) {
  const stack = [];
  const out = [];
  let nextId = 0;
  let open = null; // <p> aberto: { start, ancestors, junk }
  const closeP = (end) => {
    if (open && !open.junk) {
      const fragment = html.slice(open.start, end);
      const text = clean(fragment);
      if (isGood(text) && linkText(fragment) < text.length / 2) out.push({ text, ancestors: open.ancestors });
    }
    open = null;
  };
  const tagRe = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'p') {
      // <p> sem fechar é fechado pelo próximo <p>, como no navegador
      closeP(m.index);
      if (!closing) {
        const junk = stack.some((s) => s.junk) || JUNK.test(classAndId(m[3]));
        open = { start: tagRe.lastIndex, ancestors: stack.map((s) => s.id), junk };
      }
      continue;
    }
    if (VOID.has(tag) || INLINE.has(tag) || m[0].endsWith('/>')) continue;
    if (!closing) {
      if (BLOCK.has(tag)) closeP(m.index);
      stack.push({ tag, id: nextId++, junk: !KEEP.has(tag) && JUNK.test(classAndId(m[3])) });
      continue;
    }
    const at = stack.map((s) => s.tag).lastIndexOf(tag);
    if (at === -1) continue; // fechamento sem abertura: ignora
    if (open && open.ancestors.includes(stack[at].id)) closeP(m.index);
    stack.length = at;
  }
  closeP(html.length);
  return out;
}

// O bloco com mais texto de parágrafo vence (o avô ganha metade, para juntar trechos
// da matéria separados por diagramas ou anúncios em divs irmãos).
function largestBlock(html) {
  const paras = paragraphsWithAncestors(html);
  const score = new Map();
  const total = new Map(); // texto de parágrafo dentro de cada bloco, em qualquer nível
  const parentOf = new Map();
  for (const p of paras) {
    p.ancestors.forEach((id, k) => {
      total.set(id, (total.get(id) ?? 0) + p.text.length);
      if (k) parentOf.set(id, p.ancestors[k - 1]);
    });
    const parent = p.ancestors.at(-1);
    const grand = p.ancestors.at(-2);
    if (parent !== undefined) score.set(parent, (score.get(parent) ?? 0) + p.text.length);
    if (grand !== undefined) score.set(grand, (score.get(grand) ?? 0) + p.text.length / 2);
  }
  let best;
  let bestScore = 0;
  for (const [id, s] of score) if (s > bestScore) [best, bestScore] = [id, s];
  if (best === undefined) return paras.map((p) => p.text);
  // Sites montados em blocos (FIDE usa um widget por parágrafo) espalham a matéria em
  // dezenas de divs irmãos: sobe enquanto o bloco atual tiver menos da metade do texto
  // do bloco de cima. Se ele já tem a maior parte, o resto é outra coisa (comentários, chamadas).
  for (let up = 0; up < 8; up++) {
    const parent = parentOf.get(best);
    if (parent === undefined) break;
    const mine = total.get(best);
    const theirs = total.get(parent);
    if (theirs !== mine && mine > theirs * 0.5) break;
    best = parent;
  }
  return paras.filter((p) => p.ancestors.includes(best)).map((p) => p.text);
}

export function extractArticle(html) {
  let h = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head(?=[\s>])[\s\S]*?<\/head\s*>/i, ' ')
    // tweets e posts embutidos: texto de terceiros com @, data e link, não é a matéria
    .replace(/<blockquote[^>]*class="[^"]*(twitter-tweet|instagram-media|tiktok-embed)[^"]*"[\s\S]*?<\/blockquote\s*>/gi, ' ');
  for (const tag of DROP_TAGS) if (tag !== 'header') h = dropBlocks(h, tag);

  // linha fina fora de <p>: o blog do Lichess põe o lead num <strong class="ublog-post__intro">
  // dentro do <header>, por isso ela é procurada antes de o <header> sair
  let lead = '';
  for (const m of h.matchAll(/<(div|p|h2|h3|strong)\s[^>]*class="([^"]*)"[^>]*>/gi)) {
    if (!/(^|[\s_-])(intro|lead|standfirst)($|[\s_-])/i.test(m[2])) continue;
    const from = m.index + m[0].length;
    const to = h.slice(from).search(new RegExp('</' + m[1] + '\\s*>', 'i'));
    lead = to === -1 ? '' : clean(h.slice(from, from + to));
    if (isGood(lead)) break;
    lead = '';
  }
  h = dropBlocks(h, 'header');

  // <article> primeiro (o que tiver mais texto); se não houver matéria nele, o maior bloco com <p>
  let paras = [];
  for (const a of h.match(/<article(?=[\s>])[\s\S]*?<\/article\s*>/gi) ?? []) {
    const ps = largestBlock(a);
    if (ps.join('').length > paras.join('').length) paras = ps;
  }
  if (paras.join('').length < 400) paras = largestBlock(h);
  if (paras.length && lead && !paras.some((p) => p.includes(lead.slice(0, 60)))) paras.unshift(lead);

  // mesmo parágrafo repetido (versão mobile e desktop na mesma página) entra uma vez só
  const seen = new Set();
  paras = paras.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));

  let text = '';
  for (const p of paras) {
    const next = text ? `${text}\n\n${p}` : p;
    if (next.length > MAX_CHARS) {
      if (!text) text = p.slice(0, MAX_CHARS);
      break;
    }
    text = next;
  }
  return text;
}

export async function fetchArticle(url) {
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html/i.test(type)) return '';
    return extractArticle(await res.text());
  } catch {
    return '';
  }
}

// Abreviações que terminam em ponto sem terminar a frase ("GM.", "Dr.", "Sr.", "vs.")
const ABBR = new Set([
  'gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm', 'dr', 'dra', 'sr', 'sra', 'srta', 'mr', 'mrs', 'ms', 'prof', 'profa',
  'st', 'jr', 'vs', 'no', 'nº', 'n', 'p', 'pp', 'ex', 'cap', 'vol', 'fig', 'aprox', 'av', 'gen', 'cel', 'sto', 'sta', 'mt',
]);
// lance depois do número: "23. Dxf7", "12. e4", "15. O-O"
const MOVE = /^(?:[RDTBCKQN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8]|O-O)/;

// Aspas abertas no trecho: mais “ que ”, mais « que », número ímpar de ", ou mais ‘ que ’.
// Aspas simples também são apóstrofo ("Carlsen’s", "d'água"): quem diz o que é cada uma é a
// posição. Abre depois de espaço ou no começo; fecha antes de espaço, pontuação ou no fim.
const count = (s, re) => s.match(re)?.length ?? 0;
const SINGLE_OPEN = /(^|[\s(\[—–])[‘']/g;
const SINGLE_CLOSE = /[’'](?=[\s,.;:!?)\]—–]|$)/g;
const openQuote = (s) =>
  count(s, /“/g) > count(s, /”/g) ||
  count(s, /«/g) > count(s, /»/g) ||
  count(s, /"/g) % 2 === 1 ||
  count(s, SINGLE_OPEN) > count(s, SINGLE_CLOSE);

// Frase com citação (qualquer aspas, inclusive a simples de abertura). Frase assim reprovada
// derruba o parágrafo inteiro no resumo: sem ela, o que sobra pode mudar de sentido ou ficar sem autor.
export const hasQuote = (s) => /["“”«»]|(^|[\s(\[—–])[‘']/.test(s);

// Divide um parágrafo em frases. Só corta em . ! ? … seguidos de espaço e de letra maiúscula,
// número ou aspas; decimais ("2.5") e lances ("1.e4") não têm espaço e ficam inteiros.
// Nunca corta com aspas abertas: citação e "disse fulano" são checadas juntas, como uma frase só.
export function sentences(paragraph) {
  const text = String(paragraph ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  const re = /[.!?…]+["'”’»)\]]*\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(re.lastIndex);
    if (!/^["'“‘«(\[]?[A-ZÀ-ÖØ-Þ0-9]/.test(after)) continue; // segue em minúscula: não acabou
    const punct = m[0].trim();
    const word = text.slice(start, m.index).match(/(\S+)$/)?.[1]?.replace(/^["'“‘«(\[]+/, '') ?? '';
    if (/^\.+["'”’»)\]]*$/.test(punct)) {
      if (ABBR.has(word.toLowerCase())) continue;
      if (/^[A-ZÀ-Þ]$/.test(word)) continue; // inicial de nome: "D. Gukesh"
      if (/^(?:[a-z]\.)+[a-z]?$/i.test(word)) continue; // "p.ex.", "U.S."
      if (/^\d{1,3}$/.test(word) && MOVE.test(after)) continue;
    }
    const end = m.index + m[0].trimEnd().length;
    // "1." sozinho (lista numerada) não é frase
    if (text.slice(start, end).replace(/[^\p{L}\p{N}]/gu, '').length < 3) continue;
    if (openQuote(text.slice(start, end))) continue;
    out.push(text.slice(start, end).trim());
    start = re.lastIndex;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

// Trecho essencial da matéria para a IA: os primeiros parágrafos (lead e desenvolvimento, onde
// estão os fatos) até max caracteres. Corta entre parágrafos ou entre frases, nunca no meio de uma
// frase. Escrita e checagem recebem o mesmo trecho: o que a IA não viu não pode entrar no resumo.
export function essentials(text, max = ESSENTIAL_CHARS) {
  const paras = String(text ?? '').split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let out = '';
  for (const p of paras) {
    const next = out ? `${out}\n\n${p}` : p;
    if (next.length <= max) {
      out = next;
      continue;
    }
    // o parágrafo não cabe inteiro: entram as frases dele que cabem, na ordem
    const room = max - (out ? out.length + 2 : 0);
    let part = '';
    for (const s of sentences(p)) {
      const more = part ? `${part} ${s}` : s;
      if (more.length > room) break;
      part = more;
    }
    if (part) out = out ? `${out}\n\n${part}` : part;
    break;
  }
  // primeira frase maior que o limite inteiro (bloco sem pontuação, como uma lista): corta no último espaço
  if (!out && paras.length) {
    const cut = paras[0].slice(0, max);
    out = cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).trim();
  }
  return out;
}

const words = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

let cachedSource = null;
let cachedWords = '';

// Marcas de cada idioma: palavras curtas e termos de xadrez que quase só aparecem nele. Palavra
// comum em PT e ES ("está", "no", "nos", "dos", "este", "a") não conta para ninguém: com ela, texto
// em espanhol passava por português. "o", "e", "do" e "da" contam para o PT: no inglês e no espanhol
// são raras, e a frase misturada cai na conferência por frase. Francês e alemão aparecem em alguns
// feeds e também contam.
// Fronteira que entende acento (o \b do JS só conhece a-z, e "está" ou "às" nunca casavam); ponto e
// hífen também separam palavra: "Chess.com a" não é "com a" e "on-line" não é o "on" do inglês.
const wordList = (list) => new RegExp(String.raw`(?<![\p{L}\p{N}.\-])(?:${list})(?![\p{L}\p{N}\-])`, 'giu');
const ending = (list) => new RegExp(String.raw`(?:${list})(?![\p{L}\p{N}\-])`, 'giu');
const PT_MARKS = [
  wordList(
    'o|os|e|do|da|das|não|são|também|um|uma|umas|pelo|pela|pelos|pelas|foi|ao|aos|às|em|na|nas|num|numa|após|já|seu|sua|seus|suas|é|ele|ela|eles|elas|até|então|ainda|muito|muita|isso|essa|esse|tem|têm|depois|quando|com o|com a|que o|que a|' +
      'xadrez|torneio|torneios|rodada|rodadas|vitória|vitórias|jogador|jogadores|jogadora|jogadoras|enxadrista|enxadristas|brancas|pretas|pontos',
  ),
  ending('ção|ções|ões|ão'),
];
const OTHER_MARKS = {
  inglês: [wordList('the|and|of|was|were|with|his|her|their|this|that|is|has|have|had|after|won|in|on|for|by|to|from|at|he|she|it|be|been|will|an|who|which|round|tournament')],
  espanhol: [
    wordList('el|los|las|del|y|fue|con|una|un|la|lo|es|al|pero|muy|más|según|sus|también|después|ajedrez|torneo|ronda|jugador|jugadores|victoria|puntos|blancas|negras'),
    ending('ción|ciones'),
  ],
  francês: [wordList('les|des|est|une|dans|pour|avec|aux|du|le|et|qui|échecs')],
  alemão: [wordList('und|der|die|ist|nicht|mit|ein|eine|den|dem|auf|sich|schach')],
};
const marks = (s, list) => list.reduce((n, re) => n + (s.match(re)?.length ?? 0), 0);
// marcas do português, do outro idioma que mais aparece e tamanho do trecho
function langScore(s) {
  let other = 0;
  let lang = '';
  for (const [name, list] of Object.entries(OTHER_MARKS)) {
    const n = marks(s, list);
    if (n > other) [other, lang] = [n, name];
  }
  return { pt: marks(s, PT_MARKS), other, lang, words: s.split(/\s+/).filter(Boolean).length };
}

/**
 * Por que o texto não passa como português ('' = passa); o motivo vai para o log do robô.
 * O redator às vezes responde no idioma da fonte ou deixa nele uma frase ou uma citação.
 * Confere o texto inteiro, com mínimo de marcas proporcional ao tamanho (2 até ~75 palavras e
 * depois 1 a cada 30: um mínimo fixo reprovava o "O que aconteceu" curto, cheio de nomes e números),
 * e, à parte, cada frase de 8 palavras ou mais e cada citação entre aspas: com mais marcas de outro
 * idioma que de português, reprovam o texto todo.
 */
export function notPortuguese(text) {
  const t = String(text ?? '');
  const all = langScore(t);
  const min = Math.max(2, Math.round(all.words / 30));
  if (all.pt < min || all.pt <= all.other * 1.5) {
    return `${all.pt} marcas do português (mínimo ${min}) contra ${all.other}${all.lang ? ` do ${all.lang}` : ''} em ${all.words} palavras`;
  }
  for (const s of sentences(t)) {
    const x = langScore(s);
    if (x.words >= 8 && x.other >= 2 && x.other > x.pt) return `frase em ${x.lang}: "${s.slice(0, 60)}"`;
  }
  for (const [, q] of t.matchAll(/[“"«]([^”"»]{12,})[”"»]/g)) {
    // toda palavra com maiúscula é nome de obra ou evento ("From Talent To Title"), não fala
    if (q.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).every((w) => /^\p{Lu}/u.test(w))) continue;
    const x = langScore(q);
    if (x.other >= 2 && x.other > x.pt) return `citação em ${x.lang}: "${q.slice(0, 60)}"`;
  }
  return '';
}
export const isPortuguese = (text) => !notPortuguese(text);

// Grafia em português de países, cidades e termos que a IA às vezes deixa no original.
// Troca fixa, sem IA: não muda fato nenhum, só a forma de escrever.
const SPELLING = [
  [/\bUzbekist(?:an|ão)\b/g, 'Uzbequistão'],
  [/\bKazakhst(?:an|ão)\b/g, 'Cazaquistão'],
  [/\bSamarkand\b|\bSamarcand\b(?!a)/g, 'Samarcanda'],
  [/\bArmenia\b/g, 'Armênia'],
  [/\bGermany\b/g, 'Alemanha'],
  [/\bNetherlands\b/g, 'Holanda'],
  [/\bUkraine\b/g, 'Ucrânia'],
  [/\bHungary\b/g, 'Hungria'],
  [/\bPoland\b/g, 'Polônia'],
  [/\bGeorgia\b/g, 'Geórgia'],
  [/\bVietnam\b/g, 'Vietnã'],
  [/\bMongolia\b/g, 'Mongólia'],
  [/\bIndia\b/g, 'Índia'],
  [/\bEngland\b/g, 'Inglaterra'],
  [/\bSpain\b/g, 'Espanha'],
  [/\bFrance\b/g, 'França'],
  [/\bTurkey\b|\bTurkiye\b|\bTürkiye\b/g, 'Turquia'],
  [/\bUnited States\b/g, 'Estados Unidos'],
  // "match points" da Olimpíada: ponto de match, nunca "ponto de partida"
  // só com número antes ("um ponto de partida à frente"); "o ponto de partida da campanha" fica
  [/\b(um|meio|dois|tr[eê]s|\d+(?:[,.]\d+)?) (pontos?) de partida\b/g, '$1 $2 de match'],
];

export function fixSpelling(text) {
  return SPELLING.reduce((t, [re, to]) => t.replace(re, to), text);
}

// Anti-cópia: true se a frase repete n ou mais palavras seguidas do texto original
// (sem diferenciar maiúsculas, acentos e pontuação).
export function copiedRun(sentence, sourceText, n = 10) {
  const w = words(sentence);
  if (w.length < n) return false;
  if (sourceText !== cachedSource) {
    cachedSource = sourceText;
    cachedWords = ` ${words(sourceText).join(' ')} `;
  }
  for (let i = 0; i + n <= w.length; i++) {
    if (cachedWords.includes(` ${w.slice(i, i + n).join(' ')} `)) return true;
  }
  return false;
}

// Quanto do título e do trecho do feed aparece no texto extraído (palavras de 4+ letras, sem repetir).
// Matéria de verdade fica acima de 0,6; página ao vivo, regulamento ou propaganda fica bem abaixo.
export function feedOverlap(feedText, articleText) {
  const feed = new Set(words(feedText).filter((w) => w.length >= 4 && /^\p{L}+$/u.test(w)));
  if (!feed.size) return 0;
  const page = new Set(words(articleText));
  let hit = 0;
  for (const w of feed) if (page.has(w)) hit++;
  return hit / feed.size;
}

// Resposta da checagem: {"ok":[{"n":1,"v":true,"literal":false},...]}, um objeto por frase, na ordem.
// Índice faltando, repetido ou fora de ordem invalida tudo (null): com a resposta deslocada,
// o "false" de uma frase inventada cairia na vizinha.
export function parseChecks(res, total) {
  const ok = res?.ok;
  if (!Array.isArray(ok) || ok.length !== total) return null;
  if (!ok.every((x, k) => x?.n === k + 1 && typeof x.v === 'boolean')) return null;
  return ok.map((x) => ({ v: x.v, literal: x.literal === true }));
}
