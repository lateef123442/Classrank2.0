import React from "react";
import { Pressable, PressableProps, ViewStyle, StyleProp } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { motion } from "../../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Set false for e.g. destructive actions where a heavier confirm haptic fits better. */
  haptic?: "light" | "medium" | "selection" | "none";
  scaleTo?: number;
}

/**
 * Every primary tappable surface in the app (buttons, cards, quiz options,
 * tab-like chips) should go through this rather than a bare TouchableOpacity
 * — it's what makes the whole app feel physically responsive instead of
 * flat. Two ingredients, both cheap and both necessary: a quick spring
 * scale-down on press, and a matching haptic tick. Skipping either one is
 * noticeable even if you can't articulate why something "feels off."
 */
export default function PressableScale({
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  haptic = "light",
  scaleTo = 0.96,
  disabled,
  ...rest
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fireHaptic = () => {
    if (haptic === "none") return;
    if (haptic === "selection") {
      Haptics.selectionAsync();
    } else {
      Haptics.impactAsync(
        haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
      );
    }
  };

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) scale.value = withSpring(scaleTo, motion.springSnappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.springSnappy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (disabled) return;
        fireHaptic();
        onPress?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
