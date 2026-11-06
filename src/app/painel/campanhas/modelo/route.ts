import { NextResponse } from 'next/server';
import { requirePanel } from '@/lib/web';
import { loadImportContext } from '@/lib/importCtx';
import { buildTemplate } from '@/lib/excel';
export const dynamic = 'force-dynamic';
export async function GET() {
  await requirePanel(['MARKETING']);
  const { regs, dists, reps } = await loadImportContext();
  const buf = await buildTemplate(regs, dists, reps);
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="modelo-campanha-safraquest.xlsx"' } });
}
