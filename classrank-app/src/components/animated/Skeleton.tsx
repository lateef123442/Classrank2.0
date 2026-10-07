import React, { useEffect } from "react";
import { View, StyleSheet, DimensionValue } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors, radii } from "../../theme/tokens";

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}

/**
 * A shimmering placeholder shaped like the content it stands in for, rather
 * than a spinner. Spinners tell you "wait"; skeletons tell you "here's
 * roughly what's coming," which reads as faster and more considered even
 * when the actual load time is identical. Used throughout Home, Teacher,
 * and Admin dashboards instead of ActivityIndicator.
 */
export function Skeleton({ width = "100%", height = 16, radius = radii.sm, style }: Props) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.border }, animatedStyle, style]}
    />
  );
}

/** A ready-made skeleton matching StatCard's shape, for stat-row loading states. */
export function StatCardSkeleton() {
  return (
    <View style={styles.statCard}>
      <Skeleton width={48} height={22} radius={6} style={{ marginBottom: 8 }} />
      <Skeleton width={60} height={10} radius={4} />
    </View>
  );
}

/** A ready-made skeleton matching LeaderboardRow's shape. */
export function LeaderboardRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={32} height={32} radius={16} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="60%" height={13} style={{ marginBottom: 6 }} />
        <Skeleton width="35%" height={10} />
      </View>
      <Skeleton width={44} height={13} />
    </View>
  );
}

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
  },
});
