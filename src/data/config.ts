import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Onde o robô publica (GitHub Pages). O site é servido do mesmo lugar, então no navegador
// o digest é lido do próprio domínio; no celular, pela URL completa.
// organização chess-codex + repositório chess-codex.github.io = site na raiz do domínio
export const SITE_URL = 'https://chess-codex.github.io';

const baseUrl = (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/$/, '');
export const DIGEST_URL = Platform.OS === 'web' ? `${baseUrl}/digest.json` : `${SITE_URL}/digest.json`;

// Estatísticas de uso (PostHog, região UE). Chave vazia = nada sai do aparelho.
// A chave de projeto do PostHog é pública por natureza (só envia eventos). Todo evento
// enviado precisa estar descrito na política de privacidade (docs/privacidade.html).
export const POSTHOG_KEY = 'phc_ymMdqyJALnk8ek9pAxthkYYaaNAedvHSBAtN6UZDKrmt';
export const POSTHOG_HOST = 'https://eu.i.posthog.com';
