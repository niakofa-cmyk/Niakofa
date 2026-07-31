/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        legacy: {
          50: '#fdf8f3',
          100: '#f9ecdb',
          200: '#f0d4ad',
          300: '#e6b87d',
          400: '#d99c4e',
          500: '#c88237',
          600: '#a9692b',
          700: '#855227',
          800: '#5f3d22',
          900: '#3d2917',
          950: '#1f1409',
        },
        accent: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        ink: {
          50: '#f6f6f4',
          100: '#e7e5e0',
          200: '#d0cdc4',
          300: '#a8a499',
          400: '#85827a',
          500: '#6b6862',
          600: '#565450',
          700: '#44423f',
          800: '#2d2c2a',
          900: '#1a1a19',
          950: '#0d0d0c',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(200, 130, 55, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(200, 130, 55, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
