/** Tailwind build config — the same theme the site had inline in
 *  <script>tailwind.config = {...}</script> before task #17 moved it to the
 *  Tailwind CLI. Keep the two in sync: the CDN is gone, this file is the
 *  single source of truth for colours and fonts.
 *
 *  Build: npm run build:css  (writes assets/site.css)
 */
module.exports = {
  content: ['./index.html', './ru/index.html', './404.html'],
  theme: {
    extend: {
      colors: {
        'surface': '#0e1011',
        'surface-2': '#141719',
        'line': '#212527',
        'line-2': '#2c3134',
        'text-primary': '#f2f4f5',
        'text-secondary': '#9ba3a8',
        'text-muted': '#616b70',
        'accent': '#22d3ee',
        'accent-2': '#a78bfa',
        'green': '#34d399',
        'amber': '#fbbf24',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
