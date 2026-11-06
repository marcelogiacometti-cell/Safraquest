'use client';
import { useState } from 'react';

type D = { id: string; name: string; regionalId: string };
type U = { id: string; name: string; distributorId: string };

/** Distribuidor e filial encadeados: a filial só mostra as do distribuidor escolhido. */
export function DistUnit({ dists, units, dist: d0 = '', unit: u0 = '', requireUnit }: { dists: D[]; units: U[]; dist?: string; unit?: string; requireUnit?: boolean }) {
  const [dist, setDist] = useState(d0); const [unit, setUnit] = useState(u0);
  const us = units.filter((u) => u.distributorId === dist);
  return (<>
    <label>Distribuidor<select name="distribuidor" value={dist} onChange={(e) => { setDist(e.target.value); setUnit(''); }}><option value="">Escolha…</option>{dists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <label>Filial<select name="filial" value={unit} onChange={(e) => setUnit(e.target.value)} required={requireUnit && !!dist}><option value="">{dist ? 'Escolha…' : 'Escolha o distribuidor primeiro'}</option>{us.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
  </>);
}

export type OrgNode = { diretoria: string; distrito: string; territorio: string };
/** Diretoria › Distrito › Território: cada nível sugere o que já existe no nível acima, mas aceita um nome novo. */
export function RepOrg({ tree, v = {} }: { tree: OrgNode[]; v?: Partial<OrgNode> }) {
  const [dir, setDir] = useState(v.diretoria ?? ''); const [dis, setDis] = useState(v.distrito ?? ''); const [ter, setTer] = useState(v.territorio ?? '');
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
  const dirs = uniq(tree.map((t) => t.diretoria));
  const diss = uniq(tree.filter((t) => !dir || t.diretoria.toLowerCase() === dir.trim().toLowerCase()).map((t) => t.distrito));
  const ters = uniq(tree.filter((t) => (!dir || t.diretoria.toLowerCase() === dir.trim().toLowerCase()) && (!dis || t.distrito.toLowerCase() === dis.trim().toLowerCase())).map((t) => t.territorio));
  return (<>
    <label>Diretoria<input name="diretoria" list="dl-dir" value={dir} onChange={(e) => setDir(e.target.value)} required autoComplete="off" /></label>
    <label>Distrito<input name="distrito" list="dl-dis" value={dis} onChange={(e) => setDis(e.target.value)} required autoComplete="off" /></label>
    <label>Território<input name="territorio" list="dl-ter" value={ter} onChange={(e) => setTer(e.target.value)} required autoComplete="off" /></label>
    <datalist id="dl-dir">{dirs.map((x) => <option key={x} value={x} />)}</datalist>
    <datalist id="dl-dis">{diss.map((x) => <option key={x} value={x} />)}</datalist>
    <datalist id="dl-ter">{ters.map((x) => <option key={x} value={x} />)}</datalist>
  </>);
}

const ROLES: Record<string, string> = { VENDEDOR: 'Vendedor', GESTOR: 'Gestor (distribuidor)', REPRESENTANTE: 'Representante Corteva', MARKETING: 'Marketing (acesso total)' };

/** Categoria + vínculo + senha (só gestor e Marketing usam senha). */
export function RoleFields({ roles, dists, units, fixedDist, tree = [] }: { roles: string[]; dists: D[]; units: U[]; fixedDist?: string; tree?: OrgNode[] }) {
  const [role, setRole] = useState(roles[0]);
  const org = role === 'VENDEDOR' || role === 'GESTOR';
  return (<>
    <label>Categoria<select name="papel" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></label>
    {org && (fixedDist ? <><input type="hidden" name="distribuidor" value={fixedDist} />
      <label>Filial<select name="filial" required={role === 'VENDEDOR'} defaultValue=""><option value="">Escolha…</option>{units.filter((u) => u.distributorId === fixedDist).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></>
      : <DistUnit key={role} dists={dists} units={units} requireUnit={role === 'VENDEDOR'} />)}
    {role === 'REPRESENTANTE' && <RepOrg tree={tree} />}
    {(role === 'GESTOR' || role === 'MARKETING') && <label>Senha inicial (mín. 8 caracteres)<input name="senha" type="password" minLength={8} autoComplete="new-password" /></label>}
  </>);
}
