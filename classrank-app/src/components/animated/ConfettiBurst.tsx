import React, { useEffect, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { colors } from "../../theme/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PARTICLE_COLORS = [colors.teal, colors.violet, colors.ember, colors.gold, colors.tealDeep];
const PARTICLE_COUNT = 24;

interface ParticleProps {
  color: string;
  angle: number;
  distance: number;
  delay: number;
  size: number;
}

function Particle({ color, angle, distance, delay, size }: ParticleProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, []);

  const style = useAnimatedStyle(() => {
    const dx = Math.cos(angle) * distance * progress.value;
    // Slight downward drift on top of the radial burst so particles arc
    // rather than fly in perfectly straight lines.
    const dy = Math.sin(angle) * distance * progress.value + 40 * progress.value * progress.value;
    return {
      transform: [{ translateX: dx }, { translateY: dy }, { scale: 1 - progress.value * 0.4 }, { rotate: `${progress.value * 360}deg` }],
      opacity: 1 - progress.value,
    };
  });

  return (
    <Animated.View
      style={[{ position: "absolute", width: size, height: size, borderRadius: size * 0.25, backgroundColor: color }, style]}
    />
  );
}

interface Props {
  /** Toggle true to fire a burst. Each true->false->true cycle fires a new one. */
  active: boolean;
}

/**
 * Fires a one-shot radial particle burst from center. A from-scratch
 * implementation rather than a Lottie asset: no binary assets to ship, and
 * colors are drawn from the app's own token palette.
 *
 * Each burst gets a unique key prefix (burstId) so that if `active` is
 * toggled true again for a second celebration, React remounts fresh
 * Particle instances instead of reusing ones whose one-time mount
 * animation already finished and won't fire again.
 */
export default function ConfettiBurst({ active }: Props) {
  const [burstId, setBurstId] = useState(0);

  useEffect(() => {
    if (active) setBurstId((id) => id + 1);
  }, [active]);

  if (!active) return null;

  const particles = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.sin(i * 12.9898) * 0.2);
    return {
      key: `${burstId}-${i}`,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      angle,
      distance: 70 + ((i * 37) % 60),
      delay: (i * 11) % 90,
      size: 6 + (i % 3) * 2,
    };
  });

  return (
    <View pointerEvents="none" style={styles.container}>
      {particles.map(({ key, ...p }) => (
        <Particle key={key} {...p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: "50%",
    left: SCREEN_WIDTH / 2,
    width: 0,
    height: 0,
    zIndex: 100,
  },
});
