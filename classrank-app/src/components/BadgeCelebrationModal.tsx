import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, type, shadow, motion } from "../theme/tokens";
import PressableScale from "./animated/PressableScale";
import ConfettiBurst from "./animated/ConfettiBurst";
import { BadgeDef } from "../data/badges";

interface Props {
  badge: BadgeDef | null;
  onDismiss: () => void;
}

export default function BadgeCelebrationModal({ badge, onDismiss }: Props) {
  const scale = useSharedValue(0);

  useEffect(() => {
    if (badge) {
      scale.value = 0;
      scale.value = withDelay(150, withSpring(1, motion.springSnappy));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [badge?.id]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal visible={!!badge} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <ConfettiBurst active={!!badge} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>New Badge Unlocked</Text>
          <Animated.View style={[styles.badgeCircle, badgeStyle]}>
            <Text style={styles.badgeEmoji}>{badge?.emoji}</Text>
          </Animated.View>
          <Text style={styles.badgeLabel}>{badge?.label}</Text>
          <PressableScale style={styles.button} onPress={onDismiss} haptic="medium">
            <Text style={styles.buttonText}>Nice!</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,22,44,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    ...shadow.floating,
  },
  eyebrow: { ...type.label, color: colors.violet, marginBottom: spacing.lg },
  badgeCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.violetTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  badgeEmoji: { fontSize: 44 },
  badgeLabel: { ...type.h1, fontSize: 22, color: colors.text, marginBottom: spacing.xxl, textAlign: "center" },
  button: { backgroundColor: colors.navy, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxxl },
  buttonText: { color: "#fff", ...type.h3 },
});
