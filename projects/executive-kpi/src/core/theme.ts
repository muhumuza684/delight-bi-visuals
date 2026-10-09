export interface ThemeTokens { accent: string; from: string; to: string; ink: string; alt: string; barA: string; barB: string }

/** Visual themes. Default is the Delight Insights blue; the others follow the MUST Tables theme set. */
export const THEME_TOKENS: Record<string, ThemeTokens> = {
    luxe: { accent: "#104F9F", from: "#E6F0FA", to: "#DCEAF7", ink: "#104F9F", alt: "rgba(16, 79, 159, 0.035)", barA: "#96D8E8", barB: "#104F9F" },
    slate: { accent: "#334155", from: "#334155", to: "#3F4F66", ink: "#FFFFFF", alt: "#F1F5F9", barA: "#CBD5E1", barB: "#64748B" },
    ocean: { accent: "#0C4A6E", from: "#0C4A6E", to: "#0E5C86", ink: "#FFFFFF", alt: "#F0F9FF", barA: "#BAE6FD", barB: "#0EA5E9" },
    forest: { accent: "#14532D", from: "#14532D", to: "#1B6B3A", ink: "#FFFFFF", alt: "#F0FDF4", barA: "#BBF7D0", barB: "#22C55E" },
    sunrise: { accent: "#C2410C", from: "#C2410C", to: "#DD5A1E", ink: "#FFFFFF", alt: "#FFF7ED", barA: "#FED7AA", barB: "#FB923C" },
    midnight: { accent: "#5BA8FF", from: "#1A3858", to: "#14304F", ink: "#96D8E8", alt: "rgba(150, 216, 232, 0.06)", barA: "#28446A", barB: "#5BA8FF" },
    classic: { accent: "#104F9F", from: "#F2F5F8", to: "#E8EDF2", ink: "#104F9F", alt: "#F7F9FB", barA: "#D6DFEA", barB: "#5B6E85" }
};

export const DEFAULT_ACCENT = "#104F9F";
