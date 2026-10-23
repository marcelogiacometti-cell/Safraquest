import Link from 'next/link';
import { requireMember } from '@/lib/web';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return (<div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div className="wrap" style={{ flex: 1, width: '100%' }}>{children}</div>
    <nav className="tabs"><Link href="/app">Início</Link><Link href="/app/rankings">Ranking</Link><Link href="/app/reportar">Reportar</Link><Link href="/app/perfil">Perfil</Link></nav>
  </div>);
}
