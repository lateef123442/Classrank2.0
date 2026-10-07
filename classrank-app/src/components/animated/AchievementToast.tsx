import React, { useEffect, useState } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { SlideInUp, FadeOutUp } from "react-native-reanimated";
import { colors, fonts, radii, spacing } from "../../theme/tokens";

/** Slides in from the top for a few seconds when a quiz unlocks one or more achievements. */
export default function AchievementToast({ titles, ms = 4200 }: { titles: string[]; ms?: number }) {
  const [show, setShow] = useState(titles.length > 0);
  useEffect(() => { const t = setTimeout(() => setShow(false), ms); return () => clearTimeout(t); }, []);
  if (!show || !titles.length) return null;
  return (
    <Animated.View entering={SlideInUp.springify().damping(14)} exiting={FadeOutUp.duration(250)} style={styles.toast} pointerEvents="none">
      <Text style={styles.kicker}>🏅 ACHIEVEMENT UNLOCKED</Text>
      <Text style={styles.title}>{titles.join(" · ")}</Text>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  toast: { position: "absolute", top: spacing.md, left: spacing.xl, right: spacing.xl, zIndex: 50, backgroundColor: colors.ink, borderRadius: radii.md, padding: spacing.lg },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 11, letterSpacing: 0.6, color: colors.teal },
  title: { fontFamily: fonts.display, fontSize: 16, color: "#fff", marginTop: 2 },
});
