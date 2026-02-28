/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eaf6ff",
          100: "#d3ebff",
          500: "#1177cc",
          700: "#0d4f85"
        }
      }
    }
  },
  plugins: []
};

