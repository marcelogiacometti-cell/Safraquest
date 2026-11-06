import { db, schema } from '@/db';
import type { XlDist, XlReg, XlRep } from './excel';
export async function loadImportContext(): Promise<{ regs: XlReg[]; dists: XlDist[]; reps: XlRep[] }> {
  const regs = (await db.select().from(schema.regionals)).map((r) => ({ id: r.id, name: r.name }));
  const dists = (await db.select().from(schema.distributors)).filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, type: d.type as 'COOPERATIVA' | 'REVENDA', regionalId: d.regionalId }));
  const reps = (await db.select().from(schema.users)).filter((u) => u.role === 'REPRESENTANTE' && u.status === 'ACTIVE')
    .map((u) => ({ id: u.id, name: u.name, diretoria: u.diretoria ?? '', distrito: u.distrito ?? '', territorio: u.territorio ?? '' }));
  return { regs, dists, reps };
}
