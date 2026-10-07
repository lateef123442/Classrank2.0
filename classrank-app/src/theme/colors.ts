import { colors as newColors, radii } from "./tokens";

// Older screens (written before the design-token pass) import `{ colors,
// radius }` from this path using an earlier, smaller palette. Rather than
// touch every one of those files' styles in a single risky sweep, this
// shim maps the old names onto the new palette so they keep compiling *and*
// visually inherit the refined colors. New/rewritten screens should import
// directly from `./tokens` instead, using the fuller vocabulary (ink,
// violet, ember, tealTint, spacing, type, shadow, motion) — see Home, Quiz,
// and Leaderboard for the pattern.
export const colors = {
  ...newColors,
  navy: newColors.ink,
  bg: newColors.paper,
  tealLight: newColors.tealTint,
};

export const radius = radii;
