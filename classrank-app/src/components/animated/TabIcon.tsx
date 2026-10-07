import React, { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { motion } from "../../theme/tokens";
import { useMotionOK } from "./useMotionOK";

/** Tab bar icon that springs up slightly when its tab becomes active. */
export default function TabIcon({ name, color, size, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number; focused: boolean }) {
  const ok = useMotionOK();
  const t = useSharedValue(focused ? 1 : 0);
  useEffect(() => { t.value = ok ? withSpring(focused ? 1 : 0, motion.springSnappy) : focused ? 1 : 0; }, [focused]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.16 }, { translateY: -t.value * 2 }] }));
  return <Animated.View style={style}><Ionicons name={name} size={size} color={color} /></Animated.View>;
}
