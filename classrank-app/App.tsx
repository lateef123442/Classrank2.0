import "react-native-gesture-handler"; // must be the first import, especially on Android

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import AppSplash from "./src/components/animated/AppSplash";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "./src/context/AppContext";
import RootNavigator from "./src/navigation/RootNavigator";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { initErrorReporting } from "./src/lib/errorReporting";
import { configurePurchases } from "./src/lib/purchases";
import { initDeepLinking } from "./src/lib/deepLinking";
import { initAnalytics } from "./src/lib/analytics";
import { useAppFonts } from "./src/theme/useAppFonts";
import { colors } from "./src/theme/tokens";

initErrorReporting();
configurePurchases();
initAnalytics();

export default function App() {
  const { fontsReady, onLayoutRootView } = useAppFonts();
  const [showSplash, setShowSplash] = useState(true); // animated brand intro, layered over the app while it loads underneath

  useEffect(() => {
    const cleanup = initDeepLinking();
    return cleanup;
  }, []);

  // Splash screen stays up (see useAppFonts) until this returns true, so
  // returning null here never causes a visible blank flash.
  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        <ErrorBoundary>
          <SafeAreaProvider>
            <AppProvider>
              <NavigationContainer>
                <StatusBar style="dark" />
                <RootNavigator />
              </NavigationContainer>
            </AppProvider>
          </SafeAreaProvider>
        </ErrorBoundary>
        {showSplash && <AppSplash onDone={() => setShowSplash(false)} />}
      </View>
    </GestureHandlerRootView>
  );
}
