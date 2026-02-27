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
        // Backgrounds
        base: '#0F172A',
        surface: '#1E293B',
        elevated: '#334155',
        hover: '#475569',
        'border-subtle': '#2A3441',
        // Primary
        primary: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          subtle: 'rgba(29, 78, 216, 0.12)',
        },
        // Semantic
        success: {
          DEFAULT: '#10B981',
          subtle: 'rgba(16, 185, 129, 0.12)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          subtle: 'rgba(245, 158, 11, 0.12)',
        },
        error: {
          DEFAULT: '#F43F5E',
          subtle: 'rgba(244, 63, 94, 0.12)',
        },
        info: {
          DEFAULT: '#06B6D4',
          subtle: 'rgba(6, 182, 212, 0.12)',
        },
        // Typography
        'text-primary': '#E2E8F0',
        'text-secondary': '#94A3B8',
        'text-disabled': '#64748B',
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      },
    },
  },
  plugins: [],
}

