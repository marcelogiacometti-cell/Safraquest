'use client';
import { useRouter } from 'next/navigation';

type Reg = { id: string; name: string }; type D = { id: string; name: string; regionalId: string }; type U = { id: string; name: string; distributorId: string };
export type F = { papel: string; regional: string; dist: string; unit: string; q: string; status: string };
const ROLES: [string, string][] = [['VENDEDOR', 'Vendedor'], ['GESTOR', 'Gestor'], ['REPRESENTANTE', 'Representante'], ['REGIONAL', 'Regional'], ['DIRETORIA', 'Diretoria'], ['MARKETING', 'Marketing']];

/** Filtros encadeados: mudar um recalcula as opções dos outros. */
export function Filtros({ f, regionals, dists, units, roles }: { f: F; regionals: Reg[]; dists: D[]; units: U[]; roles: string[] }) {
  const router = useRouter();
  const go = (n: Partial<F>) => {
    const m = { ...f, ...n } as F;
    if (n.regional !== undefined) { if (m.dist && dists.find((d) => d.id === m.dist)?.regionalId !== m.regional && m.regional) { m.dist = ''; m.unit = ''; } }
    if (n.dist !== undefined) { m.unit = ''; if (m.dist) m.regional = dists.find((d) => d.id === m.dist)?.regionalId ?? m.regional; }
    if (n.unit) { const un = units.find((u) => u.id === n.unit); if (un) { m.dist = un.distributorId; m.regional = dists.find((d) => d.id === un.distributorId)?.regionalId ?? m.regional; } }
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    router.replace(`/painel/usuarios${p.size ? '?' + p : ''}`);
  };
  const ds = dists.filter((d) => !f.regional || d.regionalId === f.regional);
  const us = units.filter((u) => (f.dist ? u.distributorId === f.dist : ds.some((d) => d.id === u.distributorId)));
  const any = Object.values(f).some(Boolean);
  const S = (label: string, val: string, k: keyof F, opts: [string, string][], all: string) => (
    <label style={{ minWidth: 150, flex: 1 }}>{label}<select value={val} onChange={(e) => go({ [k]: e.target.value })} style={{ margin: '4px 0 0' }}><option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>);
  return (<div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
    {S('Categoria', f.papel, 'papel', ROLES.filter(([r]) => roles.includes(r)), 'Todas')}
    {regionals.length > 0 && S('Região', f.regional, 'regional', regionals.map((r) => [r.id, r.name]), 'Todas')}
    {S('Distribuidor', f.dist, 'dist', ds.map((d) => [d.id, d.name]), 'Todos')}
    {S('Filial', f.unit, 'unit', us.map((u) => [u.id, u.name]), 'Todas')}
    {S('Situação', f.status, 'status', [['ACTIVE', 'Ativo'], ['LEFT', 'Inativo'], ['PENDING', 'Pendente'], ['REJECTED', 'Recusado']], 'Todas')}
    <label style={{ minWidth: 180, flex: 1 }}>Buscar<input defaultValue={f.q} placeholder="Nome ou e-mail" style={{ margin: '4px 0 0' }} onKeyDown={(e) => { if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => { if (e.target.value !== f.q) go({ q: e.target.value }); }} /></label>
    {any && <button type="button" className="btn sm sec" onClick={() => router.replace('/painel/usuarios')}>Limpar</button>}
  </div>);
}
