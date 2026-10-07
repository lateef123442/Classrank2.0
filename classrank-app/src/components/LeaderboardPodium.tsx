import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from "react-native-reanimated";
import { colors, radii, spacing, type } from "../theme/tokens";
import { LeaderboardEntry } from "../types";

interface Props {
  top3: LeaderboardEntry[];
  currentUserId?: string;
}

const PODIUM_CONFIG = [
  { place: 2, height: 88, order: 0, color: colors.silver },
  { place: 1, height: 116, order: 1, color: colors.gold },
  { place: 3, height: 68, order: 2, color: colors.bronze },
];

function PodiumColumn({ entry, place, height, color, delay, isCurrentUser }: {
  entry: LeaderboardEntry;
  place: number;
  height: number;
  color: string;
  delay: number;
  isCurrentUser: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.4)) }));
  }, []);

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: progress.value }],
    opacity: progress.value,
  }));

  const initials = entry.name.charAt(0).toUpperCase();

  return (
    <View style={styles.column}>
      <View style={[styles.avatar, { borderColor: color }, isCurrentUser && styles.avatarHighlight]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.is_pro ? "👑 " : ""}
        {entry.name}
      </Text>
      <Text style={styles.podiumPoints}>{entry.points.toLocaleString()}</Text>
      <Animated.View style={[styles.bar, { height, backgroundColor: color }, columnStyle]}>
        <Text style={styles.placeNumber}>{place}</Text>
      </Animated.View>
    </View>
  );
}

export default function LeaderboardPodium({ top3, currentUserId }: Props) {
  if (top3.length < 3) return null;

  const byPlace: Record<number, LeaderboardEntry> = { 1: top3[0], 2: top3[1], 3: top3[2] };

  return (
    <View style={styles.container}>
      {PODIUM_CONFIG.map((cfg, i) => {
        const entry = byPlace[cfg.place];
        if (!entry) return null;
        return (
          <PodiumColumn
            key={entry.id}
            entry={entry}
            place={cfg.place}
            height={cfg.height}
            color={cfg.color}
            delay={i * 120}
            isCurrentUser={entry.id === currentUserId}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  column: { flex: 1, alignItems: "center", maxWidth: 110 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  avatarHighlight: { borderColor: colors.teal, borderWidth: 3 },
  avatarText: { color: "#fff", fontFamily: type.h3.fontFamily, fontSize: 18 },
  podiumName: { ...type.caption, color: colors.text, fontFamily: type.bodySemibold.fontFamily, maxWidth: 100 },
  podiumPoints: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  bar: {
    width: "100%",
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: spacing.sm,
    transformOrigin: "bottom",
  },
  placeNumber: { color: "rgba(255,255,255,0.85)", fontFamily: type.h2.fontFamily, fontSize: 20 },
});
