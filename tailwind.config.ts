import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#071318",
        panel: "#0b222a",
        aqua: "#008c8f",
        mint: "#1aa56f",
        paper: "#f7f8f4",
        line: "#dfe6e6"
      },
      boxShadow: {
        soft: "0 14px 40px rgba(7, 19, 24, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

