import type { Config } from 'tailwindcss';

/**
 * Os tokens vivem em CSS custom properties (globals.css) e são apenas
 * **referenciados** aqui. Assim o design system tem uma única fonte da
 * verdade e temas alternativos não exigem rebuild do Tailwind.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        'surface-2': 'hsl(var(--surface-2))',
        'surface-3': 'hsl(var(--surface-3))',
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        fg: 'hsl(var(--fg))',
        'fg-muted': 'hsl(var(--fg-muted))',
        'fg-subtle': 'hsl(var(--fg-subtle))',
        violet: 'hsl(var(--violet))',
        'violet-glow': 'hsl(var(--violet-glow))',
        blue: 'hsl(var(--blue))',
        cyan: 'hsl(var(--cyan))',
        success: 'hsl(var(--success))',
        warn: 'hsl(var(--warn))',
        danger: 'hsl(var(--danger))',
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px' },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '3xl': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em' }],
        '4xl': ['44px', { lineHeight: '50px', letterSpacing: '-0.03em' }],
        '5xl': ['60px', { lineHeight: '64px', letterSpacing: '-0.035em' }],
      },
      boxShadow: {
        // Elevação por borda + highlight superior, não por sombra preta pesada.
        raised: 'inset 0 1px 0 0 hsl(0 0% 100% / 0.045)',
        overlay: '0 16px 48px -12px rgb(0 0 0 / 0.6), 0 0 0 1px hsl(var(--border))',
        glow: '0 0 0 1px hsl(var(--violet) / 0.35), 0 8px 32px -8px hsl(var(--violet) / 0.45)',
      },
      transitionTimingFunction: {
        // Curva de saída rápida: 80% do movimento acontece nos primeiros 30% do tempo.
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--violet) / 0.45)' },
          '70%': { boxShadow: '0 0 0 8px hsl(var(--violet) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--violet) / 0)' },
        },
        'gradient-pan': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
