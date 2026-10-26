import Link from 'next/link';
import { currentUser } from '@/lib/web';
import { PANEL_ROLES } from '@/lib/access';
import { sair } from '../actions';
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const inside = u && PANEL_ROLES.includes(u.role as never);
  return (<>
    {inside && <nav className="top"><div className="wide">
      <b style={{ marginRight: 18 }}>🌱 SafraQuest</b>
      <Link href="/painel">Resumo</Link><Link href="/painel/campanhas">Campanhas</Link>
      {u.role === 'MARKETING' && <><Link href="/painel/usuarios">Usuários</Link><Link href="/painel/correcoes">Correções</Link><Link href="/painel/estrutura">Estrutura</Link><Link href="/painel/integracao">Integração</Link></>}
      <form action={sair} style={{ marginLeft: 'auto' }}><button className="btn sm sec">Sair</button></form>
    </div></nav>}
    <div className="wide">{children}</div>
  </>);
}
