import { currentUser } from '@/lib/web';
import { PANEL_ROLES } from '@/lib/access';
import { sair } from '../actions';
import { PainelNav } from './nav';
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const inside = u && PANEL_ROLES.includes(u.role as never);
  if (!inside) return <div className="wide">{children}</div>;
  return (<div className="shell">
    <aside className="side"><PainelNav role={u.role} name={u.name} />
      <form action={sair}><button className="sairb">Sair</button></form></aside>
    <main className="main">{children}</main>
  </div>);
}
