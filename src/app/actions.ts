'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requestLoginCode, verifyLoginCode, panelLogin, registerViaInvite } from '@/lib/auth';
import { currentQuestion, submitAnswer, QuizError, startAttempt } from '@/lib/quiz';
import { clearSession, requireMember, setSession, currentUser } from '@/lib/web';
import { submitReport } from '@/lib/reports';
import { leaveProgram, pauseNotifications } from '@/lib/admin';
import { normalizePhone } from '@/lib/phone';

const REASONS: Record<string, string> = {
  INVALID_PHONE: 'Número inválido. Use DDD + número.', NOT_FOUND: 'Esse número não está cadastrado. Peça o link de cadastro ao seu gestor.',
  PENDING: 'Seu cadastro ainda está aguardando aprovação do gestor.', INACTIVE: 'Seu acesso está inativo. Fale com seu gestor.',
  RATE_LIMIT: 'Muitos pedidos de código. Aguarde alguns minutos.', SEND_FAILED: 'Não conseguimos enviar o código agora. Tente de novo.',
};

export async function pedirCodigo(_: unknown, fd: FormData) {
  const r = await requestLoginCode(String(fd.get('tel') ?? ''));
  if (!r.ok) {
    if (r.reason === 'PENDING') redirect('/pendente');
    return { error: REASONS[r.reason] };
  }
  redirect('/entrar/codigo?tel=' + encodeURIComponent(r.phone));
}

export async function confirmarCodigo(_: unknown, fd: FormData) {
  const tel = String(fd.get('tel') ?? '');
  const r = await verifyLoginCode(tel, String(fd.get('codigo') ?? '').replace(/\D/g, ''));
  if (!r.ok) {
    const m = { NO_CODE: 'Peça um novo código.', EXPIRED: 'Código vencido. Peça um novo.', TOO_MANY: 'Muitas tentativas. Peça um novo código.', WRONG: `Código incorreto. Restam ${r.attemptsLeft ?? 0} tentativa(s).` }[r.reason];
    return { error: m };
  }
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.userId));
  await setSession(u.id, u.role);
  redirect(u.role === 'REPRESENTANTE' ? '/rep' : '/app');
}

export async function cadastrar(_: unknown, fd: FormData) {
  const r = await registerViaInvite({
    token: String(fd.get('token')), name: String(fd.get('nome') ?? ''), whatsapp: String(fd.get('tel') ?? ''),
    unitId: (fd.get('unidade') as string) || null, consent: fd.get('aceite') === 'on',
  });
  if (!r.ok) {
    const m: Record<string, string> = { NAME: 'Informe nome e sobrenome.', PHONE: 'WhatsApp inválido.', CONSENT: 'É preciso aceitar receber as mensagens para participar.', DUPLICATE: 'Esse número já está cadastrado.', UNIT: 'Escolha a sua unidade.', INVITE: 'Este link não está mais disponível.', EMAIL: 'E-mail inválido.', PASSWORD: 'Senha fraca.' };
    return { error: m[r.reason] };
  }
  redirect('/pendente');
}

export async function entrarPainel(_: unknown, fd: FormData) {
  const r = await panelLogin(String(fd.get('email') ?? ''), String(fd.get('senha') ?? ''));
  if (!r.ok) return { error: 'E-mail ou senha incorretos.' };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.userId));
  await setSession(u.id, u.role);
  redirect('/painel');
}

export async function sair() { await clearSession(); redirect('/entrar'); }

// ---- quiz (chamado pelo componente cliente) ----
export async function buscarPergunta(missionId: string) {
  const u = await requireMember();
  try { await startAttempt(u.id, missionId).catch(() => null); return await currentQuestion(u.id, missionId); }
  catch (e) { if (e instanceof QuizError) return { error: e.message }; throw e; }
}
export async function responder(missionId: string, questionId: string, chosen: number) {
  const u = await requireMember();
  try { return await submitAnswer(u.id, missionId, questionId, chosen); }
  catch (e) { if (e instanceof QuizError || e instanceof Error) return { error: e.message }; throw e; }
}

export async function reportar(_: unknown, fd: FormData) {
  const u = await requireMember();
  const kind = String(fd.get('tipo') ?? 'OTHER') as 'ERROR' | 'CONFUSING' | 'OUTDATED' | 'OTHER' | 'SUGGESTION';
  await submitReport(u.id, { questionId: (fd.get('pergunta') as string) || null, kind, text: String(fd.get('texto') ?? ''), topic: String(fd.get('tema') ?? '') });
  return { ok: 'Recebemos! Obrigado por ajudar a melhorar o quiz.' };
}
export async function pausar(_: unknown, fd: FormData) { const u = await requireMember(); await pauseNotifications(u.id, Number(fd.get('dias') ?? 7)); return { ok: 'Avisos pausados.' }; }
export async function sairPrograma() { const u = await requireMember(); await leaveProgram(u.id); await clearSession(); redirect('/entrar'); }
