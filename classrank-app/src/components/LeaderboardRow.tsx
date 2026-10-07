import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, type, shadow } from "../theme/tokens";

interface Props {
  rank: number;
  name: string;
  subtitle: string;
  points: number;
  isCurrentUser?: boolean;
  isPro?: boolean;
  percentile?: number; // 0-1, shown as a "Top X%" chip when present
}

const medalColors: Record<number, string> = {
  1: colors.gold,
  2: colors.silver,
  3: colors.bronze,
};

export default function LeaderboardRow({ rank, name, subtitle, points, isCurrentUser, isPro, percentile }: Props) {
  return (
    <View style={[styles.row, isCurrentUser && styles.rowHighlight]}>
      <View style={[styles.rankBadge, { backgroundColor: medalColors[rank] || colors.paper }]}>
        <Text style={[styles.rankText, { color: medalColors[rank] ? "#fff" : colors.textMuted }]}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {isPro && <Text style={styles.crown}>👑</Text>}
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          {percentile !== undefined && (
            <View style={styles.percentileChip}>
              <Text style={styles.percentileText}>Top {Math.max(1, Math.round((1 - percentile) * 100))}%</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.points}>{points.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowHighlight: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    backgroundColor: colors.tealTint,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rankText: { ...type.h3, fontSize: 13 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { ...type.bodyMedium, color: colors.text, flexShrink: 1 },
  crown: { fontSize: 12 },
  subtitleRow: { flexDirection: "row", alignItems: "center", marginTop: 2, flexWrap: "wrap" },
  subtitle: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  percentileChip: {
    backgroundColor: colors.violetTint,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  percentileText: { fontSize: 10, fontFamily: type.label.fontFamily, color: colors.violet },
  points: { ...type.h3, color: colors.navy },
});
