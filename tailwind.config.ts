import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        ember: "#6f6f6f",
        candle: "#d7d7d4",
        vellum: "#f4f4f2",
        dusk: "#191919",
        moss: "#4f4f4c",
        tide: "#e7e7e4",
        graphite: "#2a2a2a"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      boxShadow: {
        hush: "0 24px 80px rgba(0, 0, 0, 0.1)"
      }
    }
  },
  plugins: []
};

export default config;
