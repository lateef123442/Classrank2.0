import React from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMotionOK } from "./useMotionOK";

/** Fade + rise on mount. Remount it with a `key` to replay (e.g. when the quiz question changes). */
export default function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  const ok = useMotionOK();
  return <Animated.View entering={ok ? FadeInDown.delay(delay).duration(320) : undefined} style={style}>{children}</Animated.View>;
}
