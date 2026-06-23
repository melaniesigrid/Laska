// Expo entry point. registerRootComponent calls AppRegistry.registerComponent
// and ensures the env is set up whether in Expo Go or a native build.
import 'react-native-gesture-handler'; // must be first import (gesture handler requirement)
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
