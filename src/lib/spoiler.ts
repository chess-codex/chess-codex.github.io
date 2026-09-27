import { useStore } from './store';

// acentos combinantes (U+0300 a U+036F) montados por código, sem caractere invisível no fonte
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
// hífen que não quebra linha (U+2011), que a IA usa nos placares ("2-2"); também montado por código
const NB_HYPHEN = new RegExp(String.fromCharCode(0x2011), 'g');

// Detecta manchetes que entregam resultado. Heurística simples e local, sem IA.
// O texto é comparado sem acentos: o \b do JavaScript só entende letras sem acento.
const RESULT_PATTERNS = [
  /\b(beats?|defeats?|stuns?|crush(es)?|wins?|won|takes? (sole )?lead|ends? .* streak|eliminat\w+|knocks? out|swindles?|draws?|elected)\b/i,
  /\b(vence\w*|derrota\w*|bate\w*|elimina\w*|empat\w*|lidera\w*|vitoria\w*|conquist\w*|garant\w*|super[aou]\w*|perde\w*|campea\w*|prata|bronze|medalh\w*|titulo|eleit\w*|surpreend\w*)\b/i,
  // placares: 2.5-1.5, 2,5 × 1,5, 2½–1½ (o hífen U+2011 já virou hífen comum)
  /\b\d+(?:[.,]5|½)?\s?[-–—x×]\s?\d+(?:[.,]5|½)?\b/i,
  /\b(champion|gold|silver|medals?|ouro|norm|norma)\b/i,
];

export function looksLikeSpoiler(title: string): boolean {
  const text = title.normalize('NFD').replace(ACCENTS, '').replace(NB_HYPHEN, '-');
  return RESULT_PATTERNS.some((re) => re.test(text));
}

/**
 * Manchete segura que pode aparecer no Anti-Spoiler, ou null (aí vale o véu).
 * Igual à original não protege nada, e a que ainda conta o resultado também não:
 * falso positivo ("disputa ouro") cai no véu, que é o lado seguro.
 */
export function safeOrNull(safe: string | undefined, text: string): string | null {
  return safe && safe.trim() && safe.trim() !== text.trim() && !looksLikeSpoiler(safe) ? safe : null;
}

/**
 * Rótulo de história no Anti-Spoiler: o detalhe depois do ponto às vezes traz o placar
 * ("Olimpíada · Índia 2,5 × 1,5 Alemanha"). Fica o começo; se ele ainda contar o resultado, a editoria.
 */
export function safeKicker(kicker: string, tag: string): string {
  const head = kicker.split(' · ')[0].trim();
  return head && !looksLikeSpoiler(head) ? head : tag;
}

/**
 * Regra única do Anti-Spoiler para notícias: manchete, lista e páginas usam a mesma,
 * senão um lugar esconde o que o outro mostra. `flagged` é a marca do robô.
 */
export function useSpoilerHidden(id: string, title: string, flagged?: boolean): boolean {
  const { settings, revealed } = useStore();
  return settings.antiSpoiler && !revealed.has(id) && (!!flagged || looksLikeSpoiler(title));
}

/** Id do "revelar" de uma partida: vale no tabuleiro, no relato e na tela da partida. */
export const gameRevealId = (key: string) => `game:${key}`;

/** Resultado da partida guardado pelo Anti-Spoiler até alguém revelar (em qualquer tela). */
export function useResultHidden(key: string): boolean {
  const { settings, revealed } = useStore();
  return settings.antiSpoiler && !revealed.has(gameRevealId(key));
}
