import './globals.css';
import type { Metadata, Viewport } from 'next';
import { env } from '@/lib/env';
export const dynamic = 'force-dynamic'; // lê SUPPORT_EMAIL em tempo de execução
export const metadata: Metadata = { title: 'SafraQuest', description: 'Quiz semanal para vendedores de cooperativas e revendas' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1E7B4F' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="pt-BR"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head><body>{children}
    {env.supportEmail && <p className="mu" style={{ textAlign: 'center', fontSize: 13, margin: '24px 16px' }}>Dúvidas ou problemas? <a href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a></p>}</body></html>);
}
