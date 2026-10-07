import React, { useEffect } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withRepeat, withTiming, withSpring } from "react-native-reanimated";
import { motion } from "../../theme/tokens";
import { useMotionOK } from "./useMotionOK";

/** Wraps a quiz option: a wrong pick gives a quick head-shake; the right answer pops. Idle does nothing. */
export default function AnswerFeedback({ status, children }: { status: "idle" | "right" | "wrong"; children: React.ReactNode }) {
  const ok = useMotionOK();
  const x = useSharedValue(0);
  const s = useSharedValue(1);
  useEffect(() => {
    if (!ok) return;
    if (status === "wrong") x.value = withSequence(withTiming(-8, { duration: 50 }), withRepeat(withTiming(8, { duration: 90 }), 4, true), withTiming(0, { duration: 50 }));
    if (status === "right") s.value = withSequence(withSpring(1.04, motion.springSnappy), withSpring(1, motion.springSnappy));
  }, [status]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
