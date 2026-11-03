/** @type {import('tailwindcss').Config} */
// Colors point at CSS variables in app/globals.css (Apple system colors, light + dark)
const v = (name) => `var(--${name})`;

module.exports = {
  content: [
    './src/**/*.{jsx,js}',
    './app/**/*.{jsx,js}',
  ],
  theme: {
    extend: {
      colors: {
        bg:         v('bg'),
        surface:    v('surface'),
        'surface-2': v('surface-2'),
        label:      v('label'),
        'label-2':  v('label-2'),
        'label-3':  v('label-3'),
        separator:  v('separator'),
        fill:       v('fill'),
        'fill-2':   v('fill-2'),
        tint:       v('tint'),
        'tint-ink': v('tint-ink'),
        'tint-soft': v('tint-soft'),
        green:      v('green'),
        'green-ink': v('green-ink'),
        'green-soft': v('green-soft'),
        orange:     v('orange'),
        'orange-ink': v('orange-ink'),
        'orange-soft': v('orange-soft'),
        red:        v('red'),
        'red-ink':  v('red-ink'),
        'red-soft': v('red-soft'),
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        group: '12px',
      },
      transitionTimingFunction: {
        // Close to a critically-damped spring — used only for non-gesture transitions
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
