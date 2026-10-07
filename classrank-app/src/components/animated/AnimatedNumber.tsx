import React, { useEffect, useRef, useState } from "react";
import { Text, TextStyle, StyleProp } from "react-native";

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
  suffix?: string;
  prefix?: string;
}

/**
 * Counts from its previous value to a new one over `duration`, instead of
 * snapping instantly. Snapping reads as "a label updated"; counting reads
 * as "something happened." Used for points and similar stats throughout —
 * the number ticking up is a big part of why finishing a quiz should feel
 * like something, not just a screen change.
 *
 * Deliberately implemented as a plain JS interval rather than a Reanimated
 * worklet: this drives a `Text` string (not a transform/opacity), which
 * Reanimated can't mutate on the UI thread anyway without extra plumbing,
 * and a few JS-thread state updates over ~600ms is imperceptible.
 */
export default function AnimatedNumber({ value, style, duration = 600, suffix = "", prefix = "" }: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic — fast start, gentle settle, matches the rest of the
      // app's motion presets (see theme/tokens.ts `motion`).
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <Text style={style}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </Text>
  );
}
