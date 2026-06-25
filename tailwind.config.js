/** @type {import('tailwindcss').Config} */

// Token helper: every color reads an RGB-channel CSS var so opacity utilities
// (bg-panel/60, text-tx3/80, …) still work, and the value flips with the theme.
const t = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const tokenColors = {
  // surfaces
  bg: t("bg"),
  panel: t("panel"),
  rail: t("rail"),
  inset: t("inset"),
  thead: t("thead"),
  btn2: t("btn2"),
  chip: t("chip"),
  rowdiv: t("rowdiv"),
  logo: t("logo"),
  // borders
  bd1: t("bd1"),
  bd2: t("bd2"),
  bd3: t("bd3"),
  bd4: t("bd4"),
  bd5: t("bd5"),
  bdh: t("bdh"),
  // text (high → low emphasis)
  tx1: t("tx1"),
  tx2: t("tx2"),
  tx3: t("tx3"),
  tx4: t("tx4"),
  tx5: t("tx5"),
  tx6: t("tx6"),
  tx7: t("tx7"),
  tx8: t("tx8"),
  tx9: t("tx9"),
  // accent foregrounds
  "cy-fg": t("cy-fg"),
  "gn-fg": t("gn-fg"),
  "am-fg": t("am-fg"),
  "pu-fg": t("pu-fg"),
  "rd-fg": t("rd-fg"),
  "rd-mut": t("rd-mut"),
  arr: t("arr"),
  dep: t("dep"),
  // accent surfaces & borders
  "cy-soft": t("cy-soft"),
  "cy-soft2": t("cy-soft2"),
  "cy-row": t("cy-row"),
  "cy-bd": t("cy-bd"),
  "gn-bg": t("gn-bg"),
  "gn-bd": t("gn-bd"),
  "gn-bd-h": t("gn-bd-h"),
  "am-bg": t("am-bg"),
  "am-bd": t("am-bd"),
  "am-bd-h": t("am-bd-h"),
  "rd-bg": t("rd-bg"),
  "rd-bd": t("rd-bd"),
  "rd-bd-h": t("rd-bd-h"),
  // chrome
  dotbtn: t("dotbtn"),
  // on-accent text for filled bright buttons
  "on-cyan": t("on-cyan"),
  "on-green": t("on-green"),
};

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ...tokenColors,
        // Remap the structural slate scale the ported panels already use onto
        // theme tokens, so every existing panel themes for free in both modes.
        slate: {
          50: t("tx1"),
          100: t("tx1"),
          200: t("tx1"),
          300: t("tx3"),
          400: t("tx4"),
          500: t("tx5"),
          600: t("bd5"),
          700: t("bd4"),
          800: t("thead"),
          900: t("panel"),
          950: t("bg"),
        },
        // Cyan accent text/borders (active states, links) follow the theme.
        // The brighter sky-500/600/700 fills keep Tailwind defaults so existing
        // white-text primary buttons stay readable on both canvases.
        sky: {
          300: t("cy-fg"),
          400: t("cy-fg"),
        },
      },
    },
  },
  plugins: [],
};
