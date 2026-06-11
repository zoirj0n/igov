import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Theme-aware scale driven by CSS variables in globals.css.
        // DARK (default): inverted — ink-50 = darkest page bg, ink-900 = brightest text.
        // LIGHT (html[data-theme="light"]): warm cream page, near-black text.
        // Components keep their classes; the variables flip.
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          150: "rgb(var(--ink-150) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        // Accent = MOEI signature gold (moei.gov.ae). Existing accent-* inherit.
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          subtle: "rgb(var(--accent-subtle) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
        },
        // MOEI gold palette. Token names kept for back-compat; values are gold,
        // and the bright highlight (--hi) deepens automatically in light mode.
        tamm: {
          teal: "rgb(var(--accent) / <alpha-value>)",
          tealDark: "rgb(var(--accent-strong) / <alpha-value>)",
          cyan: "rgb(var(--hi) / <alpha-value>)",
          olive: "#c0c171",
          oliveDark: "#7b7c36",
          ink: "#12121b",
          cream: "#f7f7ed",
        },
        // Back-compat alias (legacy `ae-*` classes) re-pointed to MOEI gold.
        ae: {
          gold: "rgb(var(--accent) / <alpha-value>)",
          goldDark: "rgb(var(--accent-strong) / <alpha-value>)",
        },
        signal: {
          ok: "#00a91c",
          warn: "#c0c171",
          risk: "#e41d3d",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-manrope)", "ui-sans-serif", "sans-serif"],
        arabic: ["var(--font-noto-kufi)", '"Noto Naskh Arabic"', "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.25)",
        pop: "0 12px 36px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)",
        ring: "0 0 0 4px rgba(146, 114, 42,0.18)",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.04em" }],
      },
      letterSpacing: {
        tight: "-0.012em",
        tighter: "-0.022em",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      keyframes: {
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)", opacity: "0.65" },
          "50%": { transform: "translate3d(5%,-4%,0) scale(1.18)", opacity: "1" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        sheen: {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
        sweep: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
      },
      animation: {
        aurora: "aurora 16s ease-in-out infinite",
        "aurora-slow": "aurora 24s ease-in-out infinite",
        floaty: "floaty 7s ease-in-out infinite",
        reveal: "reveal 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
        sheen: "sheen 8s linear infinite",
        sweep: "sweep 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
