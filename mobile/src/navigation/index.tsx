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
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { PlayStackParamList, TabParamList } from './types.ts';

const PlayStack = createNativeStackNavigator<PlayStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

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
        headerStyle: { backgroundColor: palette.ground },
        headerTintColor: palette.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.ground },
      }}
    >
      <PlayStack.Screen name="PlayMenu" component={PlayMenuScreen} options={{ headerShown: false }} />
      <PlayStack.Screen name="Game" component={GameScreen} options={{ title: 'Game' }} />
    </PlayStack.Navigator>
  );
}

export function RootNavigator() {
  const { palette } = useTheme();
  return (
    <NavigationContainer linking={linking}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.textMuted,
          tabBarStyle: { backgroundColor: palette.ground, borderTopColor: palette.shade },
        }}
      >
        <Tabs.Screen name="Play" component={PlayNavigator} />
        <Tabs.Screen name="Online" component={OnlineScreen} />
        <Tabs.Screen name="Profile" component={ProfileScreen} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
