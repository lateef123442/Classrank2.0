import { useReducedMotion } from "react-native-reanimated";

/** False when the phone's "Reduce Motion" accessibility setting is on. Decorative loops and shakes check this. */
export const useMotionOK = () => !useReducedMotion();
