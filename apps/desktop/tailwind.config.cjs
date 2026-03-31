/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Geist", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ide: {
          bg: "hsl(var(--ide-bg))",
          surface: "hsl(var(--ide-surface))",
          "surface-2": "hsl(var(--ide-surface-2))",
          "surface-3": "hsl(var(--ide-surface-3))",
          border: "hsl(var(--ide-border))",
          "border-subtle": "hsl(var(--ide-border-subtle))",
          text: "hsl(var(--ide-text))",
          "text-dim": "hsl(var(--ide-text-dim))",
          "text-muted": "hsl(var(--ide-text-muted))",
          indigo: "hsl(var(--ide-indigo))",
          "indigo-dim": "hsl(var(--ide-indigo-dim))",
          "indigo-border": "hsl(var(--ide-indigo-border))",
          green: "hsl(var(--ide-green))",
          "green-bright": "hsl(var(--ide-green-bright))",
          amber: "hsl(var(--ide-amber))",
          "amber-bright": "hsl(var(--ide-amber-bright))",
          pink: "hsl(var(--ide-pink))",
          "pink-bright": "hsl(var(--ide-pink-bright))",
          teal: "hsl(var(--ide-teal))",
          red: "hsl(var(--ide-red))",
          "red-bright": "hsl(var(--ide-red-bright))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        blink: "blink 1s infinite",
      },
    },
  },
  plugins: [require("./src/renderer/node_modules/tailwindcss-animate")],
}
