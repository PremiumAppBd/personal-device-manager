/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff", 100: "#d9e6ff", 500: "#3b6ef6",
          600: "#2f58d4", 700: "#2746ab",
        },
      },
    },
  },
  plugins: [],
};
