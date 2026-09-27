import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { font, usePalette } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Três abas: a nossa edição (Hoje), tudo o que as fontes publicam (Radar) e o que a pessoa guardou
const TABS: { name: string; title: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', title: 'Hoje', icon: 'newspaper-outline', iconOn: 'newspaper' },
  { name: 'radar', title: 'Radar', icon: 'radio-outline', iconOn: 'radio' },
  { name: 'saved', title: 'Salvos', icon: 'bookmark-outline', iconOn: 'bookmark' },
];

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.whisky,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? t.iconOn : t.icon} size={23} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
