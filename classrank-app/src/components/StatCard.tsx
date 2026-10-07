import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, type, shadow } from "../theme/tokens";

interface Props {
  label: string;
  value: string | number;
  accentColor?: string;
}

export default function StatCard({ label, value, accentColor = colors.teal }: Props) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color: accentColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginHorizontal: 4,
    ...shadow.card,
  },
  value: { ...type.h1, fontSize: 22 },
  label: { ...type.caption, color: colors.textMuted, marginTop: 4, textAlign: "center" },
});
