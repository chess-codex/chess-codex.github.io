import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

// Paleta: "Azul Cosmos" + azul elétrico + whisky do ChessCodex,
// casada com o marinho do fundo da coruja e o âmbar dos olhos dela.
const dark = {
  bg: '#070B14',
  surface: '#0E1526',
  surfaceAlt: '#16203A',
  ink: '#F4F6FB',
  inkSoft: '#C9D1E0',
  muted: '#7F8BA3',
  hairline: 'rgba(148,163,196,0.14)',
  brand: '#273B5C', // marinho da coruja
  accent: '#3B82F6', // azul elétrico (links, ações)
  whisky: '#E3A04A',
  whiskySoft: 'rgba(227,160,74,0.14)',
  danger: '#F2665A',
  boardLight: '#DCE3EE',
  boardDark: '#5D7398',
  tabBar: 'rgba(7,11,20,0.92)',
};

const light: typeof dark = {
  bg: '#F6F4EF', // papel marfim
  surface: '#FFFFFF',
  surfaceAlt: '#ECE8DF',
  ink: '#10141F',
  inkSoft: '#2F3646',
  muted: '#6B7285',
  hairline: 'rgba(16,20,31,0.10)',
  brand: '#273B5C',
  accent: '#2563EB',
  whisky: '#B06F1E',
  whiskySoft: 'rgba(176,111,30,0.11)',
  danger: '#C4372C',
  boardLight: '#E9EDF3',
  boardDark: '#7D90B0',
  tabBar: 'rgba(246,244,239,0.94)',
};

export type Palette = typeof dark;

export type ThemePref = 'system' | 'light' | 'dark';
export const ThemePrefContext = createContext<ThemePref>('system');

export function useScheme(): 'light' | 'dark' {
  const pref = useContext(ThemePrefContext);
  const system = useColorScheme();
  if (pref !== 'system') return pref;
  return system === 'light' ? 'light' : 'dark';
}

export function usePalette(): Palette {
  return useScheme() === 'light' ? light : dark;
}

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28 };
