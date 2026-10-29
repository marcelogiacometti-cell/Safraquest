'use server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, baseUrl } from '@/lib/web';
import * as admin from '@/lib/admin';
import { resolveReport, type ReportAction } from '@/lib/reports';
import { closeApuracao, publishWinners } from '@/lib/winners';
import { encrypt, randomToken } from '@/lib/crypto';
import { getProvider, mapTemplateStatus } from '@/lib/whatsapp/provider';

const wrap = async <T,>(f: () => Promise<T>): Promise<{ error?: string; ok?: string; data?: T }> => {
  try { const data = await f(); return { ok: 'Feito.', data }; }
  catch (e) { return { error: e instanceof Error ? e.message : 'Erro inesperado.' }; }
};
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const date = (v: string) => (v ? new Date(v + 'T03:00:00Z') : null);

export async function aprovar(fd: FormData) { const { actor } = await requirePanel(); await wrap(() => admin.approveUser(actor, s(fd, 'id'))); revalidatePath('/painel'); }
export async function recusar(fd: FormData) { const { actor } = await requirePanel(); await wrap(() => admin.rejectUser(actor, s(fd, 'id'))); revalidatePath('/painel'); }

export async function gerarConvite(_: unknown, fd: FormData) {
  const { actor } = await requirePanel();
  const r = await wrap(() => admin.createInvite(actor, {
    role: (s(fd, 'papel') || 'VENDEDOR') as never, distributorId: s(fd, 'dist') || actor.distributorId, unitId: s(fd, 'unidade') || null,
    days: Number(s(fd, 'dias') || 7), maxUses: s(fd, 'usos') ? Number(s(fd, 'usos')) : null }));
  return r.error ? r : { ok: `Link: ${await baseUrl()}/cadastro/${r.data!.token}` };
}

export async function criarCampanha(_: unknown, fd: FormData) {
  const { actor } = await requirePanel(['MARKETING']); void actor;
  const r = await wrap(() => admin.saveCampaign(null, { name: s(fd, 'nome'), productName: s(fd, 'produto'), objective: s(fd, 'objetivo') || null,
    startDate: date(s(fd, 'inicio')), endDate: date(s(fd, 'fim')), everyWeeks: 1, speedBonus: fd.get('bonus') === 'on' }));
  if (r.error) return r;
  const { redirect } = await import('next/navigation'); redirect(`/painel/campanhas/${r.data}`);
}
export async function salvarPergunta(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const options = [s(fd, 'a'), s(fd, 'b'), s(fd, 'c'), s(fd, 'd')].filter(Boolean);
  const r = await wrap(() => admin.saveQuestion(null, { missionId: s(fd, 'missao'), text: s(fd, 'texto'), options, correct: Number(s(fd, 'certa')),
    explanation: s(fd, 'explicacao') || null, topic: s(fd, 'tema') || 'Geral', timeLimit: Number(s(fd, 'tempo') || 30) }));
  revalidatePath('/painel/campanhas/' + s(fd, 'campanha')); return r.error ? r : { ok: 'Pergunta salva.' };
}
export async function apagarPergunta(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => admin.deleteQuestion(s(fd, 'id'))); revalidatePath('/painel/campanhas/' + s(fd, 'campanha')); }
export async function definirGrupos(fd: FormData) {
  await requirePanel(['MARKETING']); await wrap(() => admin.setCampaignGroups(s(fd, 'campanha'), fd.getAll('grupos').map(String)));
  revalidatePath('/painel/campanhas/' + s(fd, 'campanha'));
}
export async function agendar(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => admin.scheduleCampaign(s(fd, 'campanha'))); revalidatePath('/painel/campanhas/' + s(fd, 'campanha')); }
export async function fecharApuracao(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => closeApuracao(s(fd, 'campanha'))); revalidatePath('/painel/campanhas/' + s(fd, 'campanha')); }
export async function publicarVencedores(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => publishWinners(s(fd, 'campanha'))); revalidatePath('/painel/campanhas/' + s(fd, 'campanha')); }

export async function resolver(fd: FormData) {
  await requirePanel(['MARKETING']);
  const t = s(fd, 'acao'); const note = s(fd, 'nota');
  const action: ReportAction = t === 'VOID' ? { type: 'VOID', note } : t === 'DISCARD' ? { type: 'DISCARD', note: note || 'Sem procedência.' }
    : t === 'ASK_MORE' ? { type: 'ASK_MORE', note: note || 'Pode detalhar?' } : { type: 'FIX', note, correct: fd.get('certa') ? Number(s(fd, 'certa')) : undefined };
  await wrap(() => resolveReport(s(fd, 'id'), action)); revalidatePath('/painel/correcoes');
}

export async function criarDistribuidor(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.createDistributor({ name: s(fd, 'nome'), type: s(fd, 'tipo') as never, regionalId: s(fd, 'regional'), firstUnit: s(fd, 'unidade') || 'Matriz' }));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Distribuidor criado.' };
}
export async function criarGrupo(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.createGroup({ name: s(fd, 'nome'), type: (s(fd, 'tipo') || null) as never, autoInclude: true }));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Grupo criado.' };
}

export async function salvarIntegracao(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const set: Partial<typeof schema.waConfig.$inferInsert> = {
    wabaId: s(fd, 'waba') || null, phoneNumberId: s(fd, 'phone') || null, displayName: s(fd, 'nome') || null,
    sendFrom: s(fd, 'de') || '08:00', sendUntil: s(fd, 'ate') || '19:00', maxPerWeek: Number(s(fd, 'max') || 4),
  };
  if (s(fd, 'token')) set.tokenEnc = encrypt(s(fd, 'token'));
  if (s(fd, 'segredo')) set.appSecretEnc = encrypt(s(fd, 'segredo'));
  const [cur] = await db.select().from(schema.waConfig).where(eq(schema.waConfig.id, 1));
  set.verifyToken = cur?.verifyToken ?? randomToken(16);
  await db.insert(schema.waConfig).values({ id: 1, ...set }).onConflictDoUpdate({ target: schema.waConfig.id, set });
  revalidatePath('/painel/integracao'); return { ok: 'Configuração salva (segredos criptografados).' };
}
export async function sincronizarModelos() {
  await requirePanel(['MARKETING']);
  const p = await getProvider(); const list = await p.listTemplates();
  for (const t of list) await db.update(schema.waTemplates).set({ status: mapTemplateStatus(t.status) }).where(eq(schema.waTemplates.name, t.name));
  revalidatePath('/painel/integracao');
}

export async function definirCarteira(fd: FormData) {
  await requirePanel(['MARKETING']);
  await wrap(() => admin.setRepPortfolio(s(fd, 'id'), fd.getAll('dists').map(String)));
  revalidatePath('/painel/usuarios');
}
export async function desativar(fd: FormData) {
  const { actor } = await requirePanel(['MARKETING']);
  await wrap(() => admin.deactivateUser(actor, s(fd, 'id')));
  revalidatePath('/painel/usuarios');
}

export async function enviarTeste() {
  const { user } = await requirePanel(['MARKETING']);
  const p = await getProvider();
  const r = await p.sendTemplate(user.email!, 'cadastro_aprovado', [user.name.split(' ')[0], await baseUrl() + '/entrar']);
  return r.ok ? { ok: 'E-mail de teste enviado. Confira a caixa de entrada e o spam.' } : { error: 'Falhou: ' + r.error };
}
