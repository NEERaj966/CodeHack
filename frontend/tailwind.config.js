/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F1F4EF',
        ink: '#23342D',
        sage: '#81917F',
        amber: '#C67948',
        forest: '#29483D',
      },
      boxShadow: {
        card: '0 12px 30px rgba(35, 52, 45, 0.06)',
      },
    },
  },
  plugins: [],
}
