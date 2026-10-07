import React, { useEffect } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from "react-native-reanimated";

interface Props {
  index?: number;
  children: React.ReactNode;
  style?: object;
}

/**
 * Fades and slides an item up into place, staggered by `index * 40ms`. Used
 * for leaderboard rows and badge grids so a freshly loaded list arrives in
 * a wave rather than popping in all at once — the difference between a
 * page that feels considered and one that feels like a database dump.
 * Capped stagger delay so a long list doesn't leave the last rows waiting
 * absurdly long to appear.
 */
export default function StaggerIn({ index = 0, children, style }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const delay = Math.min(index * 40, 400);
    progress.value = withDelay(delay, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
