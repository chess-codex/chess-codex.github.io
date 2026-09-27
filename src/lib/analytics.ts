import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { POSTHOG_HOST, POSTHOG_KEY } from '@/data/config';

// Estatísticas de uso pela API HTTP de captura do PostHog: sem SDK, sem conta, sem dado pessoal.
// Quem é quem fica num id aleatório gerado no aparelho; nada liga esse id a nome ou e-mail.
// Para não guardar IP, ligar "Discard client IP data" no projeto do PostHog.
const K_ANON = 'cc.anon';

type Props = Record<string, string | number | boolean>;

let anon: Promise<string> | null = null;

// Math.random basta: o id só separa aparelhos, não protege nada
const randomId = () =>
  Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10).padEnd(8, '0')).join('-');

function anonId(): Promise<string> {
  anon ??= (async () => {
    try {
      const stored = await AsyncStorage.getItem(K_ANON);
      if (stored) return stored;
    } catch {
      // armazenamento indisponível: vale um id só desta sessão
    }
    const id = randomId();
    AsyncStorage.setItem(K_ANON, id).catch(() => {});
    return id;
  })();
  return anon;
}

/** Registra um evento. Sem POSTHOG_KEY não faz nada; falha de rede nunca chega ao usuário. */
export function track(event: string, props?: Props): void {
  if (!POSTHOG_KEY) return;
  anonId()
    .then((distinct_id) =>
      fetch(`${POSTHOG_HOST}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event,
          distinct_id,
          timestamp: new Date().toISOString(),
          properties: {
            ...props,
            platform: Platform.OS,
            app_version: Constants.expoConfig?.version ?? '',
            // evento anônimo: o PostHog não cria perfil de pessoa para o id
            $process_person_profile: false,
          },
        }),
      }),
    )
    .catch(() => {});
}
