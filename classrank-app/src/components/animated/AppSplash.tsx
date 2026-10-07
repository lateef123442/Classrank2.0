import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing } from "react-native-reanimated";
import PulseRing from "./PulseRing";
import { colors, fonts, motion } from "../../theme/tokens";
import { useMotionOK } from "./useMotionOK";

/**
 * Animated launch screen shown above the app for ~1.6s, then fades away. It takes over from the native
 * splash (same dark background, set in app.json) so there's no flash: the ring draws itself, the mark
 * springs in, the tagline rises, then the whole layer fades out revealing the app that has been loading
 * underneath. With Reduce Motion on it simply shows briefly and disappears.
 */
export default function AppSplash({ onDone, holdMs = 1300 }: { onDone: () => void; holdMs?: number }) {
  const ok = useMotionOK();
  const [progress, setProgress] = useState(0);
  const layer = useSharedValue(1);
  const mark = useSharedValue(ok ? 0 : 1);
  const tag = useSharedValue(ok ? 0 : 1);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    if (ok) {
      mark.value = withSpring(1, motion.springSoft);
      tag.value = withDelay(420, withTiming(1, { duration: 520, easing: ease }));
    }
    const t1 = setTimeout(() => setProgress(1), 120);
    const t2 = setTimeout(() => { layer.value = withTiming(0, { duration: ok ? 450 : 0 }); }, holdMs);
    const t3 = setTimeout(() => done.current(), holdMs + (ok ? 500 : 50));
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.value }));
  const markStyle = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: 0.7 + mark.value * 0.3 }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: (1 - tag.value) * 12 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.layer, layerStyle]} pointerEvents="auto">
      <Animated.View style={markStyle}>
        <PulseRing size={132} strokeWidth={8} progress={progress} color={colors.teal} trackColor="rgba(255,255,255,0.12)">
          <Text style={styles.initials}>CR</Text>
        </PulseRing>
      </Animated.View>
      <Animated.View style={[{ alignItems: "center", marginTop: 28 }, tagStyle]}>
        <Text style={styles.word}>ClassRank</Text>
        <Text style={styles.tag}>Your study partner</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", zIndex: 1000, elevation: 1000 },
  initials: { fontFamily: fonts.displayXBold, fontSize: 36, color: "#fff" },
  word: { fontFamily: fonts.display, fontSize: 30, color: "#fff" },
  tag: { fontFamily: fonts.body, fontSize: 15, color: "rgba(255,255,255,0.65)", marginTop: 4 },
});
