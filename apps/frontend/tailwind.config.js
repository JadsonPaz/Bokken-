/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bokken: {
          navy: {
            DEFAULT: '#0f172a', // Azul-marinho profundo
            light: '#1e293b',
            accent: '#1e3a8a',
          },
          pine: {
            DEFAULT: '#064e3b', // Verde-escuro concentração
            light: '#065f46',
            hover: '#047857'
          },
          success: {
            DEFAULT: '#10b981', // Verde suave acerto
            light: '#ecfdf5',
            border: '#a7f3d0'
          },
          error: {
            DEFAULT: '#ef4444', // Vermelho discreto erro
            light: '#fef2f2',
            border: '#fecaca'
          },
          surface: {
            DEFAULT: '#ffffff',
            soft: '#f8fafc',
            subtle: '#f1f5f9'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
