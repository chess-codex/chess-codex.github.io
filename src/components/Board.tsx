import { Chess } from 'chess.js';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, SvgXml } from 'react-native-svg';

import { PIECES } from './pieces';

export type BoardThemeId = 'madeira' | 'verde' | 'azul';

// Madeira = padrão do Lichess, Verde = padrão do Chess.com, Azul = marinho da marca
export const BOARD_THEMES: Record<BoardThemeId, { name: string; light: string; dark: string }> = {
  madeira: { name: 'Madeira', light: '#F0D9B5', dark: '#B58863' },
  verde: { name: 'Verde', light: '#EEEED2', dark: '#769656' },
  azul: { name: 'Azul', light: '#DEE3E6', dark: '#8CA2AD' },
};

const FILES = 'abcdefgh';
const LAST_MOVE = 'rgba(155,199,0,0.41)';
const ARROW = 'rgba(227,160,74,0.9)';

type Sq = { from: string; to: string };

function center(sq: string, s: number) {
  const f = FILES.indexOf(sq[0]);
  const r = 8 - Number(sq[1]);
  return { x: f * s + s / 2, y: r * s + s / 2 };
}

export function Board({ fen, size, theme, last, arrow }: { fen: string; size: number; theme: BoardThemeId; last?: Sq | null; arrow?: Sq | null }) {
  const t = BOARD_THEMES[theme];
  const s = Math.floor(size / 8);
  size = s * 8; // casas inteiras: evita quebra de linha por arredondamento no flexWrap
  const board = useMemo(() => new Chess(fen).board(), [fen]);

  let arrowEl = null;
  if (arrow) {
    const a = center(arrow.from, s);
    const b = center(arrow.to, s);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = s * 0.42;
    const tip = { x: b.x - Math.cos(ang) * s * 0.12, y: b.y - Math.sin(ang) * s * 0.12 };
    const base = { x: tip.x - Math.cos(ang) * head, y: tip.y - Math.sin(ang) * head };
    const px = Math.sin(ang) * head * 0.62;
    const py = -Math.cos(ang) * head * 0.62;
    arrowEl = (
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Line x1={a.x} y1={a.y} x2={base.x} y2={base.y} stroke={ARROW} strokeWidth={s * 0.2} strokeLinecap="round" />
        <Polygon points={`${tip.x},${tip.y} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`} fill={ARROW} />
      </Svg>
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden' }}>
      <View style={styles.grid}>
        {board.map((row, r) =>
          row.map((p, f) => {
            const sq = `${FILES[f]}${8 - r}`;
            const isDark = (r + f) % 2 === 1;
            const hl = last && (last.from === sq || last.to === sq);
            const coord = isDark ? t.light : t.dark;
            return (
              <View key={sq} style={{ width: s, height: s, backgroundColor: isDark ? t.dark : t.light }}>
                {hl ? <View style={[StyleSheet.absoluteFill, { backgroundColor: LAST_MOVE }]} /> : null}
                {f === 0 ? <Text style={[styles.rank, { color: coord, fontSize: s * 0.24 }]}>{8 - r}</Text> : null}
                {r === 7 ? <Text style={[styles.file, { color: coord, fontSize: s * 0.24 }]}>{FILES[f]}</Text> : null}
                {p ? <Piece code={`${p.color}${p.type.toUpperCase()}`} s={s} /> : null}
              </View>
            );
          }),
        )}
      </View>
      {arrowEl}
    </View>
  );
}

// memo: só redesenha a peça que mudou de casa (o SVG é caro de interpretar no Android)
const Piece = memo(function Piece({ code, s }: { code: string; s: number }) {
  return <SvgXml xml={PIECES[code]} width={s} height={s} style={StyleSheet.absoluteFill} />;
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  rank: { position: 'absolute', top: 1, left: 2, fontWeight: '700' },
  file: { position: 'absolute', bottom: 0, right: 3, fontWeight: '700' },
});
