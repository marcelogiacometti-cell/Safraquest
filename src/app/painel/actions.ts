'use server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, baseUrl } from '@/lib/web';
import * as admin from '@/lib/admin';
import { resolveReport, submitReport, type ReportAction } from '@/lib/reports';
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

export async function salvarPlano(id: string | null, input: admin.CampaignPlanInput, finalize: boolean): Promise<{ error?: string; id?: string }> {
  const { actor } = await requirePanel(['MARKETING']);
  try {
    const cid = await admin.saveCampaignPlan(actor, id, input, finalize);
    revalidatePath('/painel/campanhas'); revalidatePath('/painel');
    return { id: cid };
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro inesperado.' }; }
}

export async function importarPlanilha(fd: FormData): Promise<{ error?: string; errors?: string[]; warnings?: string[]; plan?: admin.CampaignPlanInput }> {
  await requirePanel(['MARKETING']);
  const file = fd.get('arquivo');
  if (!(file instanceof File) || !file.size) return { error: 'Escolha o arquivo .xlsx.' };
  if (file.size > 2_000_000) return { error: 'Arquivo muito grande (máx. 2 MB).' };
  if (!/\.xlsx$/i.test(file.name)) return { error: 'Envie um arquivo .xlsx (modelo baixado no painel).' };
  const { loadImportContext } = await import('@/lib/importCtx'); const { parseCampaignWorkbook } = await import('@/lib/excel');
  const { regs, dists } = await loadImportContext();
  const r = await parseCampaignWorkbook(Buffer.from(await file.arrayBuffer()), regs, dists);
  return r.plan ? { plan: r.plan, warnings: r.warnings } : { errors: r.errors, warnings: r.warnings };
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
  const action: ReportAction = t === 'ACK' ? { type: 'ACK', note } : t === 'VOID' ? { type: 'VOID', note } : t === 'DISCARD' ? { type: 'DISCARD', note: note || 'Sem procedência.' }
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
  const r = await wrap(() => admin.createGroup({ name: s(fd, 'nome'), type: (s(fd, 'tipo') || null) as never, regionalId: s(fd, 'regional') || null, autoInclude: true }));
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

export async function criarRegional(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.createRegional(s(fd, 'nome')));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Regional criada.' };
}
export async function renomearRegional(_: unknown, fd: FormData) { await requirePanel(['MARKETING']); const r = await wrap(() => admin.renameRegional(s(fd, 'id'), s(fd, 'nome'))); revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Salvo.' }; }
export async function apagarRegional(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => admin.deleteRegional(s(fd, 'id'))); revalidatePath('/painel/estrutura'); }
export async function editarDistribuidor(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.updateDistributor(s(fd, 'id'), { name: s(fd, 'nome'), type: s(fd, 'tipo') as never, regionalId: s(fd, 'regional') }));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Canal atualizado.' };
}
export async function excluirDistribuidor(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.deleteDistributor(s(fd, 'id')));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Canal excluído.' };
}
export async function editarGrupo(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.updateGroup(s(fd, 'id'), { name: s(fd, 'nome'), type: (s(fd, 'tipo') || null) as never, regionalId: s(fd, 'regional') || null }));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Grupo atualizado.' };
}
export async function excluirGrupo(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.deleteGroup(s(fd, 'id')));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Grupo excluído.' };
}
export async function criarFilial(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.createUnit(s(fd, 'dist'), s(fd, 'nome'), s(fd, 'tipo') || 'Filial'));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Filial criada.' };
}
export async function editarFilial(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.renameUnit(s(fd, 'id'), s(fd, 'nome'), s(fd, 'tipo') || undefined));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Filial atualizada.' };
}
export async function excluirFilial(_: unknown, fd: FormData) {
  await requirePanel(['MARKETING']);
  const r = await wrap(() => admin.deleteUnit(s(fd, 'id')));
  revalidatePath('/painel/estrutura'); return r.error ? r : { ok: 'Filial excluída.' };
}
export async function enviarSugestao(_: unknown, fd: FormData) {
  const { user } = await requirePanel();
  const kind = s(fd, 'tipo') === 'OTHER' ? 'OTHER' : 'SUGGESTION';
  const r = await wrap(() => submitReport(user.id, { kind, text: String(fd.get('texto') ?? ''), topic: s(fd, 'tema') }));
  revalidatePath('/painel/correcoes'); return r.error ? r : { ok: 'Recebemos! Obrigado pela contribuição.' };
}
export async function criarUsuario(_: unknown, fd: FormData) {
  const { actor } = await requirePanel(['MARKETING', 'GESTOR']);
  const r = await wrap(() => admin.createUserManually(actor, {
    name: s(fd, 'nome'), email: s(fd, 'email'), role: s(fd, 'papel') as never, distributorId: s(fd, 'distribuidor') || null, unitId: s(fd, 'filial') || null,
    password: String(fd.get('senha') ?? ''), consent: fd.get('consent') === 'on' }));
  revalidatePath('/painel/usuarios');
  if (r.error) return r;
  return { ok: r.data?.notified ? 'Usuário cadastrado e avisado por e-mail.' : 'Usuário cadastrado. Ele já pode entrar com o e-mail cadastrado.' };
}
export async function editarUsuario(_: unknown, fd: FormData) {
  const { actor } = await requirePanel(['MARKETING', 'GESTOR']);
  const r = await wrap(() => admin.updateUser(actor, s(fd, 'id'), { name: s(fd, 'nome'), email: s(fd, 'email'), distributorId: s(fd, 'distribuidor') || null, unitId: s(fd, 'filial') || null, active: s(fd, 'status') === 'ACTIVE' }));
  revalidatePath('/painel/usuarios'); return r.error ? r : { ok: 'Usuário atualizado.' };
}
export async function excluirUsuario(_: unknown, fd: FormData) {
  const { actor } = await requirePanel(['MARKETING', 'GESTOR']);
  const r = await wrap(() => admin.deleteUser(actor, s(fd, 'id')));
  revalidatePath('/painel/usuarios'); return r.error ? r : { ok: 'Usuário excluído.' };
}
export async function moverDistribuidor(fd: FormData) { await requirePanel(['MARKETING']); await wrap(() => admin.setDistributorRegional(s(fd, 'id'), s(fd, 'regional'))); revalidatePath('/painel/estrutura'); }
