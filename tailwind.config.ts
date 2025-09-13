
import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      typography: (theme: (arg0: string) => any) => ({
        DEFAULT: {
          css: {
            h1: {
              color: theme('colors.primary.DEFAULT'),
            },
            h2: {
               color: theme('colors.primary.DEFAULT'),
               borderBottom: `1px solid ${theme('colors.border')}`,
               paddingBottom: '0.5rem',
            },
             h3: {
               color: theme('colors.accent.DEFAULT'),
            },
            strong: {
              color: theme('colors.foreground'),
            },
            code: {
              backgroundColor: theme('colors.muted.DEFAULT'),
              color: theme('colors.accent.DEFAULT'),
              padding: '0.2rem 0.4rem',
              borderRadius: '0.25rem',
            },
          },
        },
      }),
      fontFamily: {
        body: ['Space Grotesk', 'sans-serif'],
        headline: ['Space Grotesk', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        'red-500': '#ef4444',
        'off-button': '#491768',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: "4px",
        md: "4px",
        sm: "2px",
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'pulse-primary': {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.7)' },
          '70%': { boxShadow: '0 0 0 20px hsl(var(--primary) / 0)' },
        },
        'pulse-accent-glow': {
          '0%, 100%': { boxShadow: '0 0 10px hsl(var(--accent) / 0.5), 0 0 20px hsl(var(--accent) / 0.3)' },
          '50%': { boxShadow: '0 0 20px hsl(var(--accent) / 0.8), 0 0 35px hsl(var(--accent) / 0.5)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-primary': 'pulse-primary 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-accent-glow': 'pulse-accent-glow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
} satisfies Config;

    