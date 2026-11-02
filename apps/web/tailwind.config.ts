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
          bg: '#070709',
          surface: '#0d0d12',
          'surface-subtle': '#131319',
          'surface-hover': '#1a1a23',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.15)',
          'border-gold': 'rgba(212, 175, 55, 0.35)',
          text: '#f8f8f6',
          'text-secondary': '#a1a19b',
          'text-muted': '#686863',
          gold: '#d4af37',
          'gold-light': '#f3e7c4',
          'gold-hover': '#e5c158',
          'gold-dark': '#9f7b23',
          'gold-subtle': 'rgba(212, 175, 55, 0.08)',
          'gold-border': 'rgba(212, 175, 55, 0.22)',
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
        luxury: '0.25em',
      },
    },
  },
  plugins: [],
};

export default config;
