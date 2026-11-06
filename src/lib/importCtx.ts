import { db, schema } from '@/db';
import type { XlDist, XlReg } from './excel';
export async function loadImportContext(): Promise<{ regs: XlReg[]; dists: XlDist[] }> {
  const regs = (await db.select().from(schema.regionals)).map((r) => ({ id: r.id, name: r.name }));
  const dists = (await db.select().from(schema.distributors)).filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, type: d.type as 'COOPERATIVA' | 'REVENDA', regionalId: d.regionalId }));
  return { regs, dists };
}
