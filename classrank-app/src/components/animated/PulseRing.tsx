import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { colors, motion } from "../../theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  size?: number;
  strokeWidth?: number;
  /** 0–1. The ring fills to this proportion. */
  progress: number;
  color?: string;
  trackColor?: string;
  /** Gently pulses the ring at rest — signals "this is alive," not static chrome. */
  pulse?: boolean;
  children?: React.ReactNode;
}

/**
 * The app's signature element. Subject: climbing a rank. This ring is used
 * everywhere progress-toward-something is shown (percentile on the
 * leaderboard, points-to-next-milestone on Home) so the visual language of
 * "climbing" stays consistent across the app rather than being a one-off
 * Home screen decoration.
 */
export default function PulseRing({
  size = 120,
  strokeWidth = 10,
  progress,
  color = colors.teal,
  trackColor = "rgba(255,255,255,0.12)",
  pulse = true,
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProgress = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    animatedProgress.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: motion.timingSlow.duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  useEffect(() => {
    if (!pulse) {
      pulseScale.value = withTiming(1, { duration: 200 });
      return;
    }
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const circleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, pulseStyle]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={circleAnimatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
