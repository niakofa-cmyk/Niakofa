/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        room: {
          bg: '#09090f',
          panel: '#0d0d1b',
          card: '#141426',
          hover: '#1a1a2e',
          border: '#22223a',
          'border-light': '#2e2e50',
        },
        brand: {
          purple: '#7c3aed',
          'purple-hover': '#6d28d9',
          'purple-muted': '#3b1f8c',
          'purple-light': '#a78bfa',
          green: '#22c55e',
          'green-dim': '#16a34a',
          red: '#ef4444',
          'red-hover': '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-live': 'pulseLive 1.8s ease-in-out infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-right': 'slideRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'reaction-float': 'reactionFloat 1.8s ease-out forwards',
      },
      keyframes: {
        pulseLive: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        reactionFloat: {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '1' },
          '50%': { transform: 'translateY(-60px) scale(1.2)', opacity: '1' },
          '100%': { transform: 'translateY(-140px) scale(1.4)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
