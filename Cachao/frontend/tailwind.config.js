/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#007AFF', // Apple blue
          50: '#E6F2FF',
          100: '#CCE5FF',
          500: '#007AFF',
          600: '#0051D5',
          700: '#003D9E',
        },
      },
    },
  },
  plugins: [],
}

