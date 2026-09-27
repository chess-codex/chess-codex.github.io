import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Onde o robô publica (GitHub Pages). O site é servido do mesmo lugar, então no navegador
// o digest é lido do próprio domínio; no celular, pela URL completa.
export const SITE_URL = 'https://lael83.github.io/chess-codex';

const baseUrl = (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/$/, '');
export const DIGEST_URL = Platform.OS === 'web' ? `${baseUrl}/digest.json` : `${SITE_URL}/digest.json`;
