import React, { useEffect } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useMotionOK } from "./useMotionOK";

/** A slow in/out scale, used on the focus timer so the screen feels calm and alive rather than frozen. */
export default function Breathing({ children, amount = 0.035 }: { children: React.ReactNode; amount?: number }) {
  const ok = useMotionOK();
  const t = useSharedValue(0);
  useEffect(() => { if (ok) t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true); }, [ok]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * amount }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
