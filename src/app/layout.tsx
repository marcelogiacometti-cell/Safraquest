import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'SafraQuest', description: 'Quiz semanal para vendedores de cooperativas e revendas' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1E7B4F' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="pt-BR"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head><body>{children}</body></html>);
}
