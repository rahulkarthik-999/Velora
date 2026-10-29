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
          bg: '#08080a',
          surface: '#101014',
          'surface-subtle': '#15151a',
          'surface-hover': '#1b1b22',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.14)',
          text: '#f4f4f6',
          'text-secondary': '#9e9ea7',
          'text-muted': '#63636e',
          violet: '#7c3aed',
          'violet-hover': '#6d28d9',
          'violet-light': '#a78bfa',
          'violet-subtle': 'rgba(124, 58, 237, 0.08)',
          'violet-border': 'rgba(124, 58, 237, 0.22)',
          lavender: '#ddd6fe',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#f43f5e',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight: '-0.02em',
      },
    },
  },
  plugins: [],
};

export default config;
