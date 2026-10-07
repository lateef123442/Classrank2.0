import { useCallback, useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts as useSoraFonts,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from "@expo-google-fonts/sora";
import {
  useFonts as useInterFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

// Keep the native splash screen up until fonts are ready — otherwise the
// app briefly flashes system-font text before Sora/Inter swap in, which is
// exactly the kind of rough edge this whole pass is trying to eliminate.
SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op: this throws if called multiple times (e.g. fast refresh in dev),
  // which is harmless.
});

export function useAppFonts() {
  const [soraLoaded] = useSoraFonts({ Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold });
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [ready, setReady] = useState(false);

  const fontsLoaded = soraLoaded && interLoaded;

  useEffect(() => {
    if (fontsLoaded) setReady(true);
  }, [fontsLoaded]);

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  return { fontsReady: ready, onLayoutRootView };
}
