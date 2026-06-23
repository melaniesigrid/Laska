/**
 * Typed navigation params. React Navigation native-stack inside bottom-tabs.
 * VERIFY these helper types against the installed @react-navigation/* version.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { GameMode } from '../hooks/useGame.ts';

export type PlayStackParamList = {
  PlayMenu: undefined;
  Game: { mode: GameMode };
};

export type TabParamList = {
  Play: undefined;
  Online: undefined;
  Profile: undefined;
};

export type PlayStackScreenProps<T extends keyof PlayStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<PlayStackParamList, T>,
  BottomTabScreenProps<TabParamList>
>;

export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<TabParamList, T>;
