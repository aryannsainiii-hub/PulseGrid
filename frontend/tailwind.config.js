/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#F8F8F3', cream: '#F3F5EF', teal: { DEFAULT: '#087F83', soft: '#159A94' }, navy: '#17324D',
        sage: '#DCEDE5', mint: '#EAF5EF', sky: '#EAF2F8', mist: '#DDEAF4',
        ok: '#27966F', warn: '#D99A38', crit: '#D75E61', info: '#5D8FBD',
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(23,50,77,0.05)' },
    },
  },
  plugins: [],
}
