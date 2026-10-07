import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/tokens";

interface Props {
  children: React.ReactNode;
  glowColor?: string;
}

/**
 * The "arena" surface — used for Home's hero only, deliberately not reused
 * as a generic dark-card component elsewhere. Keeping it exclusive to one
 * place is what makes the light/dark contrast in the app read as a
 * structural idea (scoreboard vs. everyday screens) rather than an
 * inconsistent mix of dark and light cards scattered around.
 */
export default function ArenaBackground({ children, glowColor = colors.teal }: Props) {
  return (
    <LinearGradient colors={[colors.ink, colors.inkElevated]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={[styles.glow, { backgroundColor: glowColor }]} pointerEvents="none" />
      <View style={[styles.glowSecondary, { backgroundColor: colors.violet }]} pointerEvents="none" />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -100,
    right: -60,
    opacity: 0.16,
  },
  glowSecondary: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -80,
    left: -50,
    opacity: 0.12,
  },
});
