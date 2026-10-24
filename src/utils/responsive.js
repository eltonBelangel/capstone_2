// Save as: src/utils/responsive.js
import { useWindowDimensions, PixelRatio } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Designs were drawn for a 375pt-wide phone. Everything scales from that.
const BASE_WIDTH = 375;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // real status bar, camera cutout and nav bar heights

  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= 600;
  const isSmall = width < 360;

  // Scale sizes with the screen, but keep them within sensible limits
  const scale = Math.max(0.9, Math.min(width / BASE_WIDTH, isTablet ? 1.5 : 1.15));
  const size = (n) => Math.round(n * scale);

  // Content never stretches wider than ~600pt (tablets, foldables)
  const contentWidth = Math.min(width, 600);

  // Horizontal cards take a fixed share of the screen, so 3 peek on wide phones and 1.5 on small ones
  const cardWidth = Math.min(width * 0.56, 260);
  const rideCardWidth = Math.min(width * 0.42, 200);

  // Bottom tab bar sits on top of the system navigation bar
  const tabHeight = 56 + insets.bottom;

  return {
    width,
    height,
    insets,
    isTablet,
    isSmall,
    size,
    contentWidth,
    cardWidth,
    rideCardWidth,
    tabHeight,
    fontScale: PixelRatio.getFontScale(),
  };
}

// Use on headings and labels so large system font settings don't break layouts
export const fontLimit = { maxFontSizeMultiplier: 1.3 };
