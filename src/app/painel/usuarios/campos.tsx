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

const ROLES: Record<string, string> = { VENDEDOR: 'Vendedor', GESTOR: 'Gestor (distribuidor)', REPRESENTANTE: 'Representante Corteva', MARKETING: 'Marketing (acesso total)' };

/** Categoria + vínculo + senha (só gestor e Marketing usam senha). */
export function RoleFields({ roles, dists, units, fixedDist }: { roles: string[]; dists: D[]; units: U[]; fixedDist?: string }) {
  const [role, setRole] = useState(roles[0]);
  const org = role === 'VENDEDOR' || role === 'GESTOR';
  return (<>
    <label>Categoria<select name="papel" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></label>
    {org && (fixedDist ? <><input type="hidden" name="distribuidor" value={fixedDist} />
      <label>Filial<select name="filial" required={role === 'VENDEDOR'} defaultValue=""><option value="">Escolha…</option>{units.filter((u) => u.distributorId === fixedDist).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></>
      : <DistUnit key={role} dists={dists} units={units} requireUnit={role === 'VENDEDOR'} />)}
    {(role === 'GESTOR' || role === 'MARKETING') && <label>Senha inicial (mín. 8 caracteres)<input name="senha" type="password" minLength={8} autoComplete="new-password" /></label>}
  </>);
}
