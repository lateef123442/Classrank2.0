// SDK 55+ removed `expo/AppEntry.js`, so the app registers itself here.
import { registerRootComponent } from "expo";
import App from "./App";

import * as ExpoCrypto from 'expo-crypto';

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = {
      ...globalThis.crypto,
          getRandomValues: ExpoCrypto.getRandomValues,
              subtle: { digest: (alg, data) => ExpoCrypto.digest(alg, data) },
                };
                }
// Wraps App with the Expo Go / native-build setup and calls AppRegistry.registerComponent("main", ...).
registerRootComponent(App);
