import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { Skeleton } from "../animated/Skeleton";
import { useMotionOK } from "../animated/useMotionOK";
import { colors, radii, spacing, type } from "../../theme/tokens";
import PressableScale from "../animated/PressableScale";

export const Back = ({ onPress, label = "← Back" }: { onPress: () => void; label?: string }) => (
  <PressableScale onPress={onPress}><Text style={s.back}>{label}</Text></PressableScale>
);
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={s.label}>{children}</Text>;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[s.muted, style]}>{children}</Text>;
export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) =>
  onPress ? <PressableScale style={[s.card, style]} onPress={onPress}>{children}</PressableScale> : <View style={[s.card, style]}>{children}</View>;
export const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <PressableScale style={[s.chip, on && s.chipOn]} onPress={onPress}><Text style={[s.chipText, on && { color: "#fff" }]}>{label}</Text></PressableScale>
);
export const Btn = ({ label, onPress, ghost, disabled, danger }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean; danger?: boolean }) => (
  <PressableScale style={[s.btn, ghost && s.btnGhost, danger && { backgroundColor: colors.danger }, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
    <Text style={[s.btnText, ghost && { color: colors.tealDeep }]}>{label}</Text>
  </PressableScale>
);
/** Progress bar whose fill glides to its new value (and grows in on first render). */
export const Bar = ({ value, color = colors.teal }: { value: number; color?: string }) => {
  const ok = useMotionOK();
  const [w, setW] = useState(0);
  const fill = useSharedValue(0);
  const target = Math.max(0, Math.min(1, value || 0));
  useEffect(() => { fill.value = withTiming(target, { duration: ok ? 600 : 0, easing: Easing.out(Easing.cubic) }); }, [target]);
  const style = useAnimatedStyle(() => ({ width: fill.value * w }));
  return (
    <View style={s.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[s.fill, { backgroundColor: color }, style]} />
    </View>
  );
};
/** Card-shaped placeholders for list screens that are waiting on the network. */
export const ListSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <View style={{ marginTop: spacing.lg }}>
    {Array.from({ length: rows }).map((_, i) => (
      <View key={i} style={s.card}>
        <Skeleton width="55%" height={16} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={11} />
      </View>
    ))}
  </View>
);
export const Tag = ({ label, color }: { label: string; color: string }) => (
  <View style={[s.tag, { backgroundColor: color + "22" }]}><Text style={[s.tagText, { color }]}>{label}</Text></View>
);
export const STRENGTH_COLOR = { "Strong": colors.success, "Improving": colors.ember, "Needs review": colors.danger, "Not enough data": colors.textFaint } as const;

export const s = StyleSheet.create({
  back: { ...type.bodyMedium, color: colors.tealDeep, marginBottom: spacing.md },
  label: { ...type.label, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  muted: { ...type.caption, color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { ...type.bodyMedium, color: colors.text },
  btn: { backgroundColor: colors.teal, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  btnGhost: { backgroundColor: colors.tealTint },
  btnText: { ...type.h3, color: "#fff" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  tag: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: "flex-start" },
  tagText: { ...type.label },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.sm, ...type.body, color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  h1: { ...type.h1, color: colors.text },
  h2: { ...type.h2, color: colors.text },
  h3: { ...type.h3, color: colors.text },
  safe: { flex: 1, backgroundColor: colors.paper },
});
