import './globals.css';

export const metadata = {
  title: 'Baller — Card Finder',
  description: 'Find basketball cards on eBay and see which ones are worth buying.',
  appleWebApp: { capable: true, title: 'Baller', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // let bars extend under the notch / home indicator
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
