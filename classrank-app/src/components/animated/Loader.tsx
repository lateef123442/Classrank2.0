import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withRepeat, withSequence, withTiming, Easing, FadeIn } from "react-native-reanimated";
import { colors, spacing, type } from "../../theme/tokens";
import { useMotionOK } from "./useMotionOK";

function Dot({ i, color, size, ok }: { i: number; color: string; size: number; ok: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!ok) return;
    y.value = withDelay(i * 140, withRepeat(withSequence(
      withTiming(-size * 0.7, { duration: 280, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 420 }),
    ), -1, false));
  }, [ok]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: ok ? 1 - Math.min(0, y.value) / (size * 2.5) : 0.6 }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginHorizontal: size * 0.3 }, style]} />;
}

/** Three bouncing dots. Doubles as a "tutor is typing" indicator when small. */
export function Loader({ label, color = colors.teal, size = 10 }: { label?: string; color?: string; size?: number }) {
  const ok = useMotionOK();
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", height: size * 2.2, alignItems: "flex-end" }}>
        {[0, 1, 2].map((i) => <Dot key={i} i={i} color={color} size={size} ok={ok} />)}
      </View>
      {!!label && <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.md }]}>{label}</Text>}
    </View>
  );
}

/** Full-screen branded loading state (replaces the bare spinner shown while the session restores). */
export function LoadingScreen({ label = "Getting your study plan ready…" }: { label?: string }) {
  return (
    <View style={styles.full}>
      <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center" }}>
        <Text style={styles.mark}>ClassRank</Text>
        <View style={{ height: spacing.xl }} />
        <Loader label={label} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  mark: { ...type.h1, color: colors.ink },
});
