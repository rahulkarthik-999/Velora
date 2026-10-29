import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        velora: {
          bg: '#0f0f11',
          surface: '#18181b',
          'surface-hover': '#1f1f23',
          'surface-active': '#27272a',
          border: '#2e2e33',
          'border-light': '#3f3f46',
          text: '#fafafa',
          'text-secondary': '#a1a1aa',
          'text-muted': '#71717a',
          violet: '#8b5cf6',
          'violet-hover': '#7c3aed',
          'violet-light': '#a78bfa',
          'violet-bg': 'rgba(139, 92, 246, 0.1)',
          'violet-border': 'rgba(139, 92, 246, 0.2)',
          lavender: '#c4b5fd',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
