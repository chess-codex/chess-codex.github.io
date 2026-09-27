import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { usePalette } from '@/lib/theme';

const CAP = 6;

/**
 * Gráfico da avaliação ao longo da partida (acima do meio = brancas melhor).
 * Tocar num ponto leva o tabuleiro para aquele lance.
 */
export function EvalGraph({ evals, keyPly, cur, onSeek, height = 56 }: { evals: number[]; keyPly: number; cur: number; onSeek: (ply: number) => void; height?: number }) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const n = evals.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (e: number) => height / 2 - (Math.max(-CAP, Math.min(CAP, e)) / CAP) * (height / 2 - 3);

  const line = evals.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${height / 2} L0,${height / 2} Z`;

  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => w && onSeek(Math.round((e.nativeEvent.locationX / w) * (n - 1)) + 1)}
      accessibilityLabel="Gráfico de avaliação da partida"
    >
      <View style={{ height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1B1F2A' }}>
        {w ? (
          <Svg width={w} height={height}>
            <Rect x={0} y={0} width={w} height={height / 2} fill="rgba(241,238,231,0.06)" />
            <Path d={area} fill="rgba(241,238,231,0.22)" />
            <Line x1={0} y1={height / 2} x2={w} y2={height / 2} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
            <Path d={line} stroke="#F1EEE7" strokeWidth={1.5} fill="none" />
            <Line x1={x(keyPly)} y1={0} x2={x(keyPly)} y2={height} stroke={c.whisky} strokeWidth={2} />
            {cur > 0 ? <Circle cx={x(cur - 1)} cy={y(evals[cur - 1])} r={3.5} fill={c.accent} /> : null}
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}
