import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';

export type Role = 'MARKETING' | 'DIRETORIA' | 'REGIONAL' | 'REPRESENTANTE' | 'GESTOR' | 'VENDEDOR';
export type Actor = { id: string; role: Role; distributorId: string | null; unitId: string | null; regionalId: string | null; name?: string };

export const PANEL_ROLES: Role[] = ['MARKETING', 'DIRETORIA', 'REGIONAL', 'GESTOR'];

export const isMarketing = (a: Actor) => a.role === 'MARKETING';
export const canEditCampaigns = isMarketing;
export const canManageIntegration = isMarketing;
export const canResolveReports = isMarketing;
export const canManageStructure = isMarketing;
export const canSeeReports = (a: Actor) => ['MARKETING', 'DIRETORIA', 'REGIONAL', 'GESTOR', 'REPRESENTANTE'].includes(a.role);
export const canFinalizeWinners = isMarketing;

/** Quais distribuidores o perfil enxerga. null = todos. */
export async function visibleDistributorIds(a: Actor): Promise<string[] | null> {
  if (a.role === 'MARKETING' || a.role === 'DIRETORIA') return null;
  if (a.role === 'REGIONAL') {
    if (!a.regionalId) return [];
    const rows = await db.select({ id: schema.distributors.id }).from(schema.distributors).where(eq(schema.distributors.regionalId, a.regionalId));
    return rows.map((r) => r.id);
  }
  if (a.role === 'REPRESENTANTE') {
    const rows = await db.select({ id: schema.repAssignments.distributorId }).from(schema.repAssignments).where(eq(schema.repAssignments.userId, a.id));
    return rows.map((r) => r.id);
  }
  if (a.role === 'GESTOR') return a.distributorId ? [a.distributorId] : [];
  return a.distributorId ? [a.distributorId] : [];
}

export async function canSeeDistributor(a: Actor, distributorId: string): Promise<boolean> {
  const ids = await visibleDistributorIds(a);
  return ids === null || ids.includes(distributorId);
}

export type Target = { role: Role; distributorId: string | null; unitId: string | null };

/** Quem aprova quem: Marketing aprova qualquer cadastro; gestor aprova vendedores do seu distribuidor (e da sua unidade, se for gestor de unidade). */
export function canApprove(a: Actor, t: Target): boolean {
  if (a.role === 'MARKETING') return true;
  if (a.role === 'GESTOR') {
    if (t.role !== 'VENDEDOR') return false;
    if (!a.distributorId || a.distributorId !== t.distributorId) return false;
    return !a.unitId || a.unitId === t.unitId;
  }
  return false;
}

export function canCreateInvite(a: Actor, role: Role, distributorId: string | null, unitId: string | null, unitDistributor?: string | null): boolean {
  if (a.role === 'MARKETING') return ['GESTOR', 'VENDEDOR', 'REPRESENTANTE'].includes(role);
  if (a.role === 'GESTOR') {
    if (role !== 'VENDEDOR') return false;
    if (!a.distributorId || distributorId !== a.distributorId) return false;
    if (a.unitId && unitId !== a.unitId) return false;
    if (unitId && unitDistributor && unitDistributor !== a.distributorId) return false;
    return true;
  }
  return false;
}

export async function loadActor(userId: string): Promise<Actor | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.status !== 'ACTIVE') return null;
  return { id: u.id, role: u.role as Role, distributorId: u.distributorId, unitId: u.unitId, regionalId: u.regionalId, name: u.name };
}
export { inArray };
