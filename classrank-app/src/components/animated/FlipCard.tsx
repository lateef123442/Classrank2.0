import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing } from "react-native-reanimated";
import { useMotionOK } from "./useMotionOK";

/**
 * A two-sided card that turns over in 3D. Give it a `key` tied to the card's identity so a new card
 * mounts un-flipped (otherwise the previous answer's back face would flash while it turns back).
 */
export default function FlipCard({ flipped, front, back, faceStyle, height = 220 }: {
  flipped: boolean; front: React.ReactNode; back: React.ReactNode; faceStyle?: object; height?: number;
}) {
  const ok = useMotionOK();
  const v = useSharedValue(flipped ? 1 : 0);
  useEffect(() => { v.value = withTiming(flipped ? 1 : 0, { duration: ok ? 420 : 0, easing: Easing.out(Easing.cubic) }); }, [flipped]);
  const f = useAnimatedStyle(() => ({ transform: [{ perspective: 1000 }, { rotateY: `${interpolate(v.value, [0, 1], [0, 180])}deg` }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ perspective: 1000 }, { rotateY: `${interpolate(v.value, [0, 1], [180, 360])}deg` }] }));
  return (
    <View style={{ height }}>
      <Animated.View style={[StyleSheet.absoluteFill, faceStyle, styles.face, f]}>{front}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, faceStyle, styles.face, b]}>{back}</Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({ face: { backfaceVisibility: "hidden", alignItems: "center", justifyContent: "center" } });
