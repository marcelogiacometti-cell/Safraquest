'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const I = (d: ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const ICONS: Record<string, ReactNode> = {
  resumo: I(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  campanhas: I(<><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" /></>),
  ranking: I(<><path d="M8 21h8M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>),
  usuarios: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.5a5 5 0 0 1 4.5 5" /></>),
  correcoes: I(<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></>),
  estrutura: I(<><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></>),
  email: I(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
};

export function PainelNav({ role, name }: { role: string; name: string }) {
  const path = usePathname() ?? '';
  const mkt = role === 'MARKETING';
  const is = (h: string) => (h === '/painel' ? path === '/painel' : path === h || path.startsWith(h + '/'));
  const items: { href: string; label: string; icon: string; sub?: { href: string; label: string }[] }[] = [
    { href: '/painel', label: 'Resumo', icon: 'resumo' },
    { href: '/painel/campanhas', label: 'Campanhas', icon: 'campanhas', sub: [{ href: '/painel/campanhas', label: 'Campanhas cadastradas' }, ...(mkt ? [{ href: '/painel/campanhas/nova', label: 'Nova campanha' }] : [])] },
    { href: '/painel/ranking', label: 'Ranking', icon: 'ranking' },
    ...(mkt || role === 'GESTOR' ? [{ href: '/painel/usuarios', label: 'Usuários', icon: 'usuarios', sub: [{ href: '/painel/usuarios', label: 'Usuários cadastrados' }, { href: '/painel/usuarios/adicionar', label: 'Adicionar usuários' }] }] : []),
    ...(!mkt ? [{ href: '/painel/sugestoes', label: 'Enviar sugestão', icon: 'correcoes' }] : []),
    ...(mkt ? [{ href: '/painel/correcoes', label: 'Correções', icon: 'correcoes' }, { href: '/painel/estrutura', label: 'Estrutura', icon: 'estrutura' }, { href: '/painel/integracao', label: 'E-mail', icon: 'email' }] : []),
  ];
  return (<>
    <div className="brand"><span className="logo">🌱</span><div><b>SafraQuest</b><small>Força de vendas</small></div></div>
    <nav className="snav">
      {items.map((it) => { const on = is(it.href); return (
        <div key={it.href} className={'sg' + (on ? ' on' : '')}>
          <Link href={it.href} className={'si' + (on ? ' act' : '')}>{ICONS[it.icon]}<span>{it.label}</span></Link>
          {it.sub && <div className="ssub">{it.sub.map((s) => <Link key={s.href} href={s.href} className={path === s.href || (s.href === it.href && path.startsWith(it.href) && !it.sub!.some((o) => o.href !== it.href && path.startsWith(o.href))) ? 'cur' : ''}>{s.label}</Link>)}</div>}
        </div>); })}
    </nav>
    <div className="me2"><span className="mu2">{role === 'MARKETING' ? 'Marketing' : role === 'GESTOR' ? 'Gestor' : role === 'REGIONAL' ? 'Regional' : role === 'DIRETORIA' ? 'Diretoria' : role}</span><b>{name}</b></div>
  </>);
}
