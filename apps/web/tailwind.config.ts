import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Manrope", "sans-serif"]
      },
      boxShadow: {
        float: "0 20px 60px -40px rgba(15, 23, 42, 0.5)"
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
} satisfies Config;
