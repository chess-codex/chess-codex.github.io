import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { StoreProvider } from '@/lib/store';
import { usePalette, useScheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <StoreProvider>
      <AppStack />
    </StoreProvider>
  );
}

// Fica dentro do StoreProvider para respeitar o tema escolhido nos Ajustes.
function AppStack() {
  const c = usePalette();
  const scheme = useScheme();
  return (
    // No computador o app vira uma coluna central, como um site de notícias; no celular ocupa a tela toda
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="story/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="read/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="game/[key]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
      </View>
    </View>
  );
}
