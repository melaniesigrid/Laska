/**
 * Navigation tree: a bottom-tab navigator (Play / Online / Profile) with a
 * native-stack inside the Play tab (menu → game). Maps onto the web app's
 * homegrown view switch. Deep links (laska://) are configured via `linking`.
 *
 * VERIFY navigator factory names + options against the installed
 * @react-navigation/* version.
 */
import React from 'react';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlayMenuScreen } from '../screens/PlayMenuScreen.tsx';
import { GameScreen } from '../screens/GameScreen.tsx';
import { OnlineScreen } from '../screens/OnlineScreen.tsx';
import { ProfileScreen } from '../screens/ProfileScreen.tsx';
import { TabIcon, type TabIconName } from '../components/TabIcon.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { PlayStackParamList, TabParamList } from './types.ts';

const PlayStack = createNativeStackNavigator<PlayStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICON: Record<keyof TabParamList, TabIconName> = {
  Play: 'play',
  Online: 'online',
  Profile: 'profile',
};

const linking: LinkingOptions<TabParamList> = {
  prefixes: ['laska://'],
  config: {
    screens: {
      Play: { screens: { PlayMenu: 'play', Game: 'game' } },
      Online: 'online',
      Profile: 'profile',
    },
  },
};

function PlayNavigator() {
  const { palette } = useTheme();
  return (
    <PlayStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.backdrop },
        headerTintColor: palette.text,
        headerTitleStyle: { fontFamily: 'Fraunces_600SemiBold' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.backdrop },
      }}
    >
      <PlayStack.Screen
        name="PlayMenu"
        component={PlayMenuScreen}
        // Hidden header, but set the title so Game's back button reads "Menu"
        // instead of the raw route name "PlayMenu".
        options={{ headerShown: false, title: 'Menu' }}
      />
      <PlayStack.Screen name="Game" component={GameScreen} options={{ title: 'Game' }} />
    </PlayStack.Navigator>
  );
}

export function RootNavigator() {
  const { palette } = useTheme();
  return (
    <NavigationContainer linking={linking}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.textMuted,
          tabBarLabelStyle: { fontFamily: 'HankenGrotesk_600SemiBold' },
          tabBarStyle: { backgroundColor: palette.backdrop, borderTopColor: palette.shade },
          tabBarIcon: ({ color, size }) => (
            <TabIcon name={TAB_ICON[route.name as keyof typeof TAB_ICON]} color={color} size={size} />
          ),
        })}
      >
        <Tabs.Screen name="Play" component={PlayNavigator} />
        <Tabs.Screen name="Online" component={OnlineScreen} />
        <Tabs.Screen name="Profile" component={ProfileScreen} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
