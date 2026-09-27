// Ranking oficial da FIDE (ratings.fide.com). O robô usa para montar a lista
// "Top 10 FIDE" que o app acompanha; atualiza sozinho quando o ranking muda.

// Apelidos curtos demais geram falso positivo ("So", "Wei"); nesses casos só o nome completo conta.
const SHORT_OK = new Set(['Giri', 'Ding']);

function aliases(first, last) {
  const full = first ? `${first} ${last}` : last;
  const out = [full];
  if (last.length >= 5 || SHORT_OK.has(last)) out.push(last);
  if (last === 'Praggnanandhaa') out.push('Pragg');
  return [...new Set(out)];
}

export async function fetchTop(list = 'open', n = 10) {
  const res = await fetch(`https://ratings.fide.com/a_top.php?list=${list}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 ChessCodexNews/0.1' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`FIDE HTTP ${res.status}`);
  const html = await res.text();
  const rows = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;
    // "Carlsen, Magnus" | "Praggnanandhaa R" | "Erigaisi Arjun"
    const raw = cells[1];
    let first = '';
    let last = raw;
    if (raw.includes(',')) [last, first] = raw.split(',').map((x) => x.trim());
    else if (/ R$/.test(raw)) last = raw.replace(/ R$/, '');
    else if (raw.split(' ').length === 2) [last, first] = raw.split(' ');
    // China, Coreia e Vietnã: sobrenome primeiro, como a imprensa escreve ("Hou Yifan")
    const eastern = ['CHN', 'KOR', 'VIE', 'TPE'].includes(cells[2]);
    const name = !first ? last : eastern ? `${last} ${first}` : `${first} ${last}`;
    rows.push({
      id: `${list}-${last.toLowerCase().replace(/[^a-z]/g, '')}`,
      name,
      aliases: eastern ? [name, `${first} ${last}`] : aliases(first, last),
      rank: Number(cells[0]),
      country: cells[2],
      rating: Number(cells[3]),
      list,
    });
    if (rows.length >= n) break;
  }
  if (rows.length < n) throw new Error(`FIDE: só ${rows.length} jogadores lidos`);
  return rows;
}
