import React, { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { colors } from "../../theme/tokens";

interface Props {
  streak: number;
  size?: number;
}

/**
 * A 0-day streak renders as a dim, still ember; a growing streak flickers
 * more energetically and glows brighter. The intensity mapping is
 * deliberately gentle (caps out by day ~14) rather than linear forever —
 * an unbounded effect would either be invisible early on or absurd late.
 */
export default function StreakFlame({ streak, size = 28 }: Props) {
  const flicker = useSharedValue(1);
  const intensity = Math.min(1, streak / 14);

  useEffect(() => {
    if (streak <= 0) return;
    const flickerRange = 0.06 + intensity * 0.1;
    flicker.value = withRepeat(
      withSequence(
        withTiming(1 + flickerRange, { duration: 260 + Math.random() * 120, easing: Easing.inOut(Easing.quad) }),
        withTiming(1 - flickerRange * 0.4, { duration: 220 + Math.random() * 100, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 240, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [streak > 0]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flicker.value }],
    opacity: streak > 0 ? 0.55 + intensity * 0.45 : 0.35,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Text style={[styles.flame, { fontSize: size }]}>🔥</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flame: {
    textAlign: "center",
  },
});
