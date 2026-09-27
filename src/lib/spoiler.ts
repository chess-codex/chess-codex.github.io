// Detecta manchetes que entregam resultado. Heurística simples e local, sem IA.
const RESULT_PATTERNS = [
  /\b(beats?|defeats?|stuns?|crush(es)?|wins?|won|takes? (sole )?lead|ends? .* streak|eliminat\w+|knocks? out|swindles?|draws?)\b/i,
  /\b(vence|derrota|bate|elimina|empata|lidera)\w*\b/i,
  /\b\d(\.5|½)?\s?[-–]\s?\d(\.5|½)?\b/, // placares tipo 2.5-1.5
  /\b(champion|campe[aã]o|gold|ouro|norm|norma)\b/i,
];

export function looksLikeSpoiler(title: string): boolean {
  return RESULT_PATTERNS.some((re) => re.test(title));
}
