import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#101511",
        surface: "#101511",
        "surface-dim": "#101511",
        "surface-container": "#1c211c",
        "surface-container-low": "#181d19",
        "surface-container-high": "#262b27",
        "surface-container-highest": "#313631",
        "surface-variant": "#313631",
        "surface-bright": "#353a36",
        "on-surface": "#dfe4dd",
        "on-surface-variant": "#becabd",
        "on-background": "#dfe4dd",
        primary: "#7dda98",
        "primary-container": "#5cb87a",
        "on-primary": "#00391b",
        "on-primary-container": "#004522",
        secondary: "#bbcabc",
        "secondary-container": "#3d4a3f",
        "on-secondary-container": "#aab9ab",
        outline: "#889488",
        "outline-variant": "#3f4940",
        error: "#ffb4ab",
        "error-container": "#93000a",
        "on-error": "#690005",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      spacing: {
        xs: "8px",
        sm: "16px",
        md: "24px",
        lg: "32px",
        xl: "48px",
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      fontSize: {
        "label-caps": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" },
        ],
        "headline-lg": [
          "32px",
          { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
      },
      maxWidth: {
        content: "1400px",
      },
      animation: {
        "pulse-blue": "pulse-blue 2s infinite",
      },
      keyframes: {
        "pulse-blue": {
          "0%": { boxShadow: "0 0 0 0 rgba(0, 145, 255, 0.4)" },
          "70%": { boxShadow: "0 0 0 10px rgba(0, 145, 255, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(0, 145, 255, 0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
