/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <--- TRÈS IMPORTANT
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Tes couleurs personnalisées ici
    },
  },
  plugins: [],
}