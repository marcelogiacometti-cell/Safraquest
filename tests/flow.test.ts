import { describe, expect, it, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { addSeller, freshWorld, setupDb } from './helpers';
import { checkInvite, panelLogin, registerViaInvite, requestLoginCode, verifyLoginCode } from '@/lib/auth';
import { approveUser, campaignChecklist, createInvite, createGroup, saveCampaign, saveQuestion, scheduleCampaign, setCampaignGroups, rejectUser, AdminError } from '@/lib/admin';
import { consoleOutbox } from '@/lib/whatsapp/provider';
import { currentQuestion, submitAnswer, openMissionFor, attemptSummary, badgesOf, syncCampaignStatuses } from '@/lib/quiz';
import { sellerRankings, topAndMe } from '@/lib/stats';
import { dispatchDue } from '@/lib/dispatch';
import { handleWebhook, verifySignature } from '@/lib/whatsapp/webhook';
import { createHmac } from 'node:crypto';

setupDb();

type W = Awaited<ReturnType<typeof freshWorld>>;
let w: W;
let campaignId: string;
let missionIds: string[] = [];
const T0 = new Date('2026-11-02T12:30:00Z'); // segunda 09:30 em Brasília, depois da abertura

async function buildCampaign() {
  campaignId = await saveCampaign(null, {
    name: 'Lançamento [Produto A]', productName: 'Produto A',
    startDate: new Date('2026-11-02T03:00:00Z'), endDate: new Date('2026-11-22T03:00:00Z'), // 3 semanas
  });
  const ms = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, campaignId));
  ms.sort((a, b) => a.number - b.number);
  missionIds = ms.map((m) => m.id);
  for (const mid of missionIds) for (let i = 0; i < 5; i++) {
    await saveQuestion(null, { missionId: mid, text: `Pergunta ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct: i % 4, explanation: 'porque sim' });
  }
  const gid = await createGroup({ name: 'Todos', autoInclude: true });
  await setCampaignGroups(campaignId, [gid]);
}

beforeAll(async () => { w = await freshWorld(); });

describe('cadastro por convite e aprovação', () => {
  it('gestor só gera link de vendedor do próprio distribuidor', async () => {
    const g = w.actor(w.gestor);
    await expect(createInvite(g, { role: 'GESTOR', distributorId: w.beta.d.id })).rejects.toThrow(AdminError);
    await expect(createInvite(g, { role: 'VENDEDOR', distributorId: w.alfa.d.id })).rejects.toThrow(AdminError);
    const inv = await createInvite(g, { role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: w.beta.us[0].id, days: 7, maxUses: 2 });
    expect(inv.url).toContain('/cadastro/');
  });

  it('vendedor se cadastra, fica pendente e só entra depois da aprovação', async () => {
    const g = w.actor(w.gestor);
    const inv = await createInvite(g, { role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: w.beta.us[0].id, maxUses: 2 });
    const bad = await registerViaInvite({ token: inv.token, name: 'Carlos', email: 'carlos@t.com', consent: true });
    expect(bad).toMatchObject({ ok: false, reason: 'NAME' });
    const noConsent = await registerViaInvite({ token: inv.token, name: 'Carlos Menezes', email: 'carlos@t.com', consent: false });
    expect(noConsent).toMatchObject({ ok: false, reason: 'CONSENT' });
    const ok = await registerViaInvite({ token: inv.token, name: 'Carlos Menezes', email: 'carlos@t.com', consent: true });
    expect(ok.ok).toBe(true);
    const dup = await registerViaInvite({ token: inv.token, name: 'Outro Carlos', email: 'carlos@t.com', consent: true });
    expect(dup).toMatchObject({ ok: false, reason: 'DUPLICATE' });

    // pendente não consegue pedir código
    expect(await requestLoginCode('carlos@t.com')).toMatchObject({ ok: false, reason: 'PENDING' });
    const u = (await db.select().from(schema.users).where(eq(schema.users.email, 'carlos@t.com')))[0];
    const res = await approveUser(g, u.id);
    expect(res.notified).toBe(true);
    expect(consoleOutbox.some((m) => m.template === 'cadastro_aprovado')).toBe(true);
    await expect(approveUser(g, u.id)).rejects.toThrow(/já foi decidido/);
    expect((await requestLoginCode('carlos@t.com')).ok).toBe(true);
  });

  it('limite de usos do link e link vencido', async () => {
    const g = w.actor(w.gestor);
    const inv = await createInvite(g, { role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: w.beta.us[1].id, maxUses: 1 });
    await registerViaInvite({ token: inv.token, name: 'Ana Souza', email: 'ana@t.com', consent: true });
    const full = await registerViaInvite({ token: inv.token, name: 'Bia Souza', email: 'bia@t.com', consent: true });
    expect(full).toMatchObject({ ok: false, reason: 'INVITE', invite: 'FULL' });
    const old = await createInvite(w.actor(w.marketing), { role: 'GESTOR', distributorId: w.beta.d.id, days: 1 });
    await db.update(schema.inviteLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.inviteLinks.token, old.token));
    expect(await checkInvite(old.token)).toMatchObject({ ok: false, reason: 'EXPIRED' });
    expect(await checkInvite('nao-existe')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });

  it('gestor não aprova vendedor de outro distribuidor; recusar muda o estado', async () => {
    const outro = await addSeller(w.alfa.d.id, w.alfa.us[0].id, 'Paulo Alfa', 'PENDING');
    await expect(approveUser(w.actor(w.gestor), outro.id)).rejects.toThrow(/não pode aprovar/);
    await rejectUser(w.actor(w.marketing), outro.id);
    const [r] = await db.select().from(schema.users).where(eq(schema.users.id, outro.id));
    expect(r.status).toBe('REJECTED');
  });
});

describe('login por código no WhatsApp', () => {
  it('código correto entra; errado conta tentativas; 3 erros bloqueiam', async () => {
    const u = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Login Teste');
    const phone = u.email!;
    expect((await requestLoginCode(phone)).ok).toBe(true);
    const sent = consoleOutbox.filter((m) => m.template === 'codigo_acesso').at(-1)!;
    const code = sent.params![0];
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await verifyLoginCode(phone, wrong)).toMatchObject({ ok: false, reason: 'WRONG', attemptsLeft: 2 });
    expect(await verifyLoginCode(phone, wrong)).toMatchObject({ ok: false, reason: 'WRONG', attemptsLeft: 1 });
    expect(await verifyLoginCode(phone, wrong)).toMatchObject({ ok: false, reason: 'TOO_MANY' });
    expect(await verifyLoginCode(phone, code)).toMatchObject({ ok: false, reason: 'TOO_MANY' });
    // novo código resolve
    expect((await requestLoginCode(phone)).ok).toBe(true);
    const code2 = consoleOutbox.filter((m) => m.template === 'codigo_acesso').at(-1)!.params![0];
    expect(await verifyLoginCode(phone, code2)).toMatchObject({ ok: true });
    expect(await verifyLoginCode(phone, code2)).toMatchObject({ ok: false }); // não reutiliza
  });
  it('número desconhecido, inválido e limite de pedidos', async () => {
    expect(await requestLoginCode('abc')).toMatchObject({ ok: false, reason: 'INVALID_EMAIL' });
    expect(await requestLoginCode('x@nao.com')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
    const u = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Spam Teste');
    for (let i = 0; i < 3; i++) expect((await requestLoginCode(u.email!)).ok).toBe(true);
    expect(await requestLoginCode(u.email!)).toMatchObject({ ok: false, reason: 'RATE_LIMIT' });
  });
  it('painel: e-mail e senha', async () => {
    expect((await panelLogin('MKT@corteva.test', 'senha-forte-123')).ok).toBe(true);
    expect((await panelLogin('mkt@corteva.test', 'errada')).ok).toBe(false);
    expect((await panelLogin('ninguem@x.com', 'senha-forte-123')).ok).toBe(false);
  });
});

describe('campanha, agendamento e quiz', () => {
  beforeAll(async () => { await buildCampaign(); });

  it('lista de pendências barra o agendamento até estar completa', async () => {
    const [c2] = await db.insert(schema.campaigns).values({ name: 'Vazia', productName: 'X' }).returning();
    await expect(scheduleCampaign(c2.id)).rejects.toThrow(/pendências/);
    const chk = await campaignChecklist(campaignId);
    expect(chk.ok).toBe(true);
    await db.update(schema.waTemplates).set({ status: 'IN_REVIEW' }).where(eq(schema.waTemplates.name, 'ultimo_aviso_missao'));
    expect((await campaignChecklist(campaignId)).ok).toBe(false);
    await expect(scheduleCampaign(campaignId)).rejects.toThrow(/ultimo_aviso_missao/);
    await db.update(schema.waTemplates).set({ status: 'APPROVED' }).where(eq(schema.waTemplates.name, 'ultimo_aviso_missao'));
    await scheduleCampaign(campaignId);
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    expect(c.status).toBe('SCHEDULED');
  });

  it('cada missão aceita no máximo 5 perguntas e valida alternativas', async () => {
    await expect(saveQuestion(null, { missionId: missionIds[0], text: 'a', options: ['x', 'y'], correct: 0 })).rejects.toThrow(/máximo/);
    await expect(saveQuestion(null, { missionId: missionIds[0], text: 'a', options: ['x', 'x'], correct: 0 })).rejects.toThrow(/repetidas/);
    await expect(saveQuestion(null, { missionId: missionIds[0], text: 'a', options: ['x', 'y'], correct: 5 })).rejects.toThrow(/correta/);
  });

  it('missão fica fechada antes de abrir e aberta no horário', async () => {
    const u = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Quiz Um');
    expect(await openMissionFor(u.id, new Date('2026-11-01T12:00:00Z'))).toBeNull();
    await syncCampaignStatuses(T0);
    const m = await openMissionFor(u.id, T0);
    expect(m?.number).toBe(1);
  });

  it('quiz completo: o gabarito não vaza e o tempo vem do servidor', async () => {
    const u = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Quiz Dois');
    let t = T0.getTime();
    for (let i = 0; i < 5; i++) {
      const cur = await currentQuestion(u.id, missionIds[0], new Date(t));
      if ('finished' in cur) throw new Error('acabou cedo');
      expect(JSON.stringify(cur)).not.toContain('"correct"');
      expect(cur.position).toBe(i + 1);
      t += 6000;
      const real = (await db.select().from(schema.questions).where(eq(schema.questions.id, cur.question.id)))[0];
      const pick = i === 2 ? (real.correct + 1) % 4 : real.correct; // erra a 3ª
      const fb = await submitAnswer(u.id, missionIds[0], cur.question.id, pick, new Date(t));
      expect(fb.correct).toBe(i !== 2);
      expect(fb.correctIndex).toBe(real.correct);
    }
    const s = await attemptSummary(u.id, missionIds[0]);
    expect(s).toMatchObject({ points: 180, hits: 4, total: 5, finished: true });
    const done = await currentQuestion(u.id, missionIds[0], new Date(t));
    expect('finished' in done).toBe(true);
    const b = await badgesOf(u.id);
    expect(b.find((x) => x.key === 'first_mission')?.earned).toBe(true);
    expect(b.find((x) => x.key === 'perfect')?.earned).toBe(false);
  });

  it('não dá para responder pergunta que não é a atual, nem duas vezes', async () => {
    const u = await addSeller(w.beta.d.id, w.beta.us[1].id, 'Quiz Tres');
    const cur = await currentQuestion(u.id, missionIds[0], T0);
    if ('finished' in cur) throw new Error('x');
    const other = (await db.select().from(schema.questions).where(eq(schema.questions.missionId, missionIds[0])))[4];
    await expect(submitAnswer(u.id, missionIds[0], other.id, 0, new Date(T0.getTime() + 5000))).rejects.toThrow(/atual/);
    await submitAnswer(u.id, missionIds[0], cur.question.id, 0, new Date(T0.getTime() + 5000));
    await expect(submitAnswer(u.id, missionIds[0], cur.question.id, 0, new Date(T0.getTime() + 6000))).rejects.toThrow(/atual/);
  });

  it('tempo esgotado conta como erro, mesmo que o app mande resposta tarde', async () => {
    const u = await addSeller(w.beta.d.id, w.beta.us[1].id, 'Quiz Quatro');
    const cur = await currentQuestion(u.id, missionIds[0], T0);
    if ('finished' in cur) throw new Error('x');
    const q = (await db.select().from(schema.questions).where(eq(schema.questions.id, cur.question.id)))[0];
    const fb = await submitAnswer(u.id, missionIds[0], cur.question.id, q.correct, new Date(T0.getTime() + 60_000));
    expect(fb.correct).toBe(false); expect(fb.timedOut).toBe(true);
    // volta depois de muito tempo: as perguntas vencidas viram erro e a missão fecha sozinha
    const back = await currentQuestion(u.id, missionIds[0], new Date(T0.getTime() + 3_600_000));
    expect('finished' in back || back.position > 1).toBe(true);
  });

  it('missão fechada não aceita início novo', async () => {
    const u = await addSeller(w.alfa.d.id, w.alfa.us[0].id, 'Quiz Cinco');
    await expect(currentQuestion(u.id, missionIds[0], new Date('2026-11-09T12:00:00Z'))).rejects.toThrow(/não está aberta/);
  });
});

describe('rankings: o que cada vendedor pode ver', () => {
  it('geral, distribuidor e unidade; empate decidido pelo menor tempo', async () => {
    const [beta0, beta1] = w.beta.us;
    const a = await addSeller(w.beta.d.id, beta0.id, 'Ranking A');
    const b = await addSeller(w.beta.d.id, beta0.id, 'Ranking B');
    const c = await addSeller(w.alfa.d.id, w.alfa.us[0].id, 'Ranking C');
    for (const [u, gap] of [[a, 4000], [b, 9000], [c, 5000]] as const) {
      let t = T0.getTime() + 600_000;
      for (let i = 0; i < 5; i++) {
        const cur = await currentQuestion(u.id, missionIds[0], new Date(t));
        if ('finished' in cur) break;
        const q = (await db.select().from(schema.questions).where(eq(schema.questions.id, cur.question.id)))[0];
        t += gap;
        await submitAnswer(u.id, missionIds[0], cur.question.id, q.correct, new Date(t));
      }
    }
    const rk = await sellerRankings(a.id, { kind: 'season' });
    const pa = rk.general.find((x) => x.id === a.id)!; const pb = rk.general.find((x) => x.id === b.id)!;
    expect(pa.points).toBe(pb.points); // 5/5 + bônus para os dois
    expect(pa.pos).toBeLessThan(pb.pos); // A foi mais rápido
    // dentro do distribuidor só aparecem colegas do mesmo distribuidor
    expect(rk.inDistributor.every((p) => p.distributorId === w.beta.d.id)).toBe(true);
    expect(rk.inUnit.every((p) => p.unitId === beta0.id)).toBe(true);
    // unidades do próprio distribuidor aparecem; unidade com menos de 3 participantes fica sem posição
    expect(rk.units.every((u) => [beta0.id, beta1.id].includes(u.id))).toBe(true);
    expect(rk.units.find((u) => u.id === beta1.id)?.pos).toBe(0);
    const view = topAndMe(rk.general, a.id, 2);
    expect(view.top).toHaveLength(2);
  });
});

describe('agendador de mensagens', () => {
  it('envia a abertura uma única vez por vendedor, respeitando consentimento e saída', async () => {
    await db.delete(schema.messageLogs);
    const optOut = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Sem Aceite');
    await db.update(schema.users).set({ optOutAt: new Date() }).where(eq(schema.users.id, optOut.id));
    const noConsent = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Nunca Aceitou');
    await db.update(schema.users).set({ consentAt: null }).where(eq(schema.users.id, noConsent.id));
    const before = consoleOutbox.length;
    const r1 = await dispatchDue(T0);
    expect(r1.sent).toBeGreaterThan(0);
    const logs = await db.select().from(schema.messageLogs);
    expect(logs.some((l) => l.userId === optOut.id)).toBe(false);
    expect(logs.some((l) => l.userId === noConsent.id)).toBe(false);
    expect(consoleOutbox.length - before).toBe(r1.sent);
    const r2 = await dispatchDue(new Date(T0.getTime() + 300_000));
    expect(r2.sent).toBe(0); // idempotente
  });
  it('não envia fora do horário nem em domingo', async () => {
    expect((await dispatchDue(new Date('2026-11-02T03:00:00Z'))).windowClosed).toBe(true);
    expect((await dispatchDue(new Date('2026-11-08T15:00:00Z'))).windowClosed).toBe(true);
  });
  it('lembrete só vai para quem não começou', async () => {
    await syncCampaignStatuses(new Date('2026-11-04T20:30:00Z'));
    const r = await dispatchDue(new Date('2026-11-04T20:30:00Z'));
    expect(r.moments).toBeGreaterThan(0);
    const reminders = await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.kind, 'REMINDER'));
    const started = new Set((await db.select().from(schema.attempts).where(eq(schema.attempts.missionId, missionIds[0]))).map((a) => a.userId));
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((m) => !started.has(m.userId))).toBe(true);
  });
  it('modelo não aprovado bloqueia o envio', async () => {
    await db.update(schema.waTemplates).set({ status: 'IN_REVIEW' }).where(eq(schema.waTemplates.name, 'ultimo_aviso_missao'));
    const r = await dispatchDue(new Date('2026-11-07T13:30:00Z'));
    expect(r.blocked.join(' ')).toContain('ultimo_aviso_missao');
    await db.update(schema.waTemplates).set({ status: 'APPROVED' }).where(eq(schema.waTemplates.name, 'ultimo_aviso_missao'));
  });
  it('qualidade vermelha pausa tudo', async () => {
    await db.update(schema.waConfig).set({ quality: 'RED' }).where(eq(schema.waConfig.id, 1));
    const r = await dispatchDue(new Date('2026-11-07T13:30:00Z'));
    expect(r.blocked.join(' ')).toContain('vermelha');
    await db.update(schema.waConfig).set({ quality: 'GREEN' }).where(eq(schema.waConfig.id, 1));
  });
});

describe('webhook da Meta', () => {
  it('assinatura inválida é rejeitada', () => {
    const body = '{"a":1}';
    const sig = 'sha256=' + createHmac('sha256', 'segredo').update(body).digest('hex');
    expect(verifySignature(body, sig, 'segredo')).toBe(true);
    expect(verifySignature(body, sig, 'outro')).toBe(false);
    expect(verifySignature(body, null, 'segredo')).toBe(false);
  });
  it('atualiza status, não regride e trata SAIR', async () => {
    const [log] = await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.status, 'SENT')).limit(1);
    await db.update(schema.messageLogs).set({ waMessageId: 'wamid.TESTE' }).where(eq(schema.messageLogs.id, log.id));
    await handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.TESTE', status: 'read' }] } }] }] });
    await handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.TESTE', status: 'delivered' }] } }] }] });
    expect((await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.id, log.id)))[0].status).toBe('READ');
    await handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.TESTE', status: 'failed', errors: [{ title: 'Número inválido' }] }] } }] }] });
    expect((await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.id, log.id)))[0]).toMatchObject({ status: 'FAILED', error: 'Número inválido' });

    const [u0] = await db.select().from(schema.users).where(eq(schema.users.id, log.userId));
    await db.update(schema.users).set({ whatsapp: '5554900000001' }).where(eq(schema.users.id, u0.id));
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, u0.id));
    const res = await handleWebhook({ entry: [{ changes: [{ value: { messages: [{ from: u.whatsapp!, type: 'text', text: { body: ' sair ' } }] } }] }] });
    expect(res.optOuts).toBe(1);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(after.optOutAt).not.toBeNull();
    const logs = await db.select().from(schema.consentLogs).where(and(eq(schema.consentLogs.userId, u.id), eq(schema.consentLogs.kind, 'REVOKE')));
    expect(logs.length).toBe(1);
    const reply = await handleWebhook({ entry: [{ changes: [{ value: { messages: [{ from: u.whatsapp!, type: 'text', text: { body: 'oi' } }] } }] }] });
    expect(reply.replies).toBe(1);
  });
});

describe('links para gestor e representante', () => {
  it('só o Marketing gera link de gestor/representante; gestor cadastra com e-mail e senha', async () => {
    const m = w.actor(w.marketing);
    const g = await createInvite(m, { role: 'GESTOR', distributorId: w.alfa.d.id, days: 7 });
    const sem = await registerViaInvite({ token: g.token, name: 'Gestor Alfa', email: '', consent: false });
    expect(sem).toMatchObject({ ok: false, reason: 'EMAIL' });
    const curta = await registerViaInvite({ token: g.token, name: 'Gestor Alfa', consent: false, email: 'g@alfa.test', password: '123' });
    expect(curta).toMatchObject({ ok: false, reason: 'PASSWORD' });
    const ok = await registerViaInvite({ token: g.token, name: 'Gestor Alfa', consent: false, email: 'G@Alfa.test', password: 'senha-do-gestor' });
    expect(ok.ok).toBe(true);
    expect((await panelLogin('g@alfa.test', 'senha-do-gestor')).ok).toBe(false); // ainda pendente
    await approveUser(m, (ok as { userId: string }).userId);
    expect((await panelLogin('g@alfa.test', 'senha-do-gestor')).ok).toBe(true);
    await expect(createInvite(w.actor(w.gestor), { role: 'REPRESENTANTE' })).rejects.toThrow(AdminError);
  });
  it('representante: link sem distribuidor, aprovação e carteira', async () => {
    const m = w.actor(w.marketing);
    const r = await createInvite(m, { role: 'REPRESENTANTE', days: 7 });
    const ok = await registerViaInvite({ token: r.token, name: 'Rita Representante', email: 'rita@t.com', consent: true });
    expect(ok.ok).toBe(true);
    const uid = (ok as { userId: string }).userId;
    await approveUser(m, uid);
    const { setRepPortfolio } = await import('@/lib/admin');
    await setRepPortfolio(uid, [w.alfa.d.id, w.beta.d.id]);
    expect((await db.select().from(schema.repAssignments).where(eq(schema.repAssignments.userId, uid))).length).toBe(2);
    expect((await requestLoginCode('rita@t.com')).ok).toBe(true);
  });
});

describe('equipe de Marketing (acesso total)', () => {
  it('só Marketing convida; link de uso único; entra com e-mail e senha após aprovação', async () => {
    const m = w.actor(w.marketing);
    await expect(createInvite(w.actor(w.gestor), { role: 'MARKETING' })).rejects.toThrow(AdminError);
    const inv = await createInvite(m, { role: 'MARKETING', distributorId: w.beta.d.id, days: 90, maxUses: 50 });
    const row = (await db.select().from(schema.inviteLinks).where(eq(schema.inviteLinks.token, inv.token)))[0];
    expect(row.maxUses).toBe(1); expect(row.distributorId).toBeNull();
    expect(row.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(7 * 86_400_000 + 5000);
    const sem = await registerViaInvite({ token: inv.token, name: 'Time Marketing', email: 'time@mkt.test', consent: false });
    expect(sem).toMatchObject({ ok: false, reason: 'PASSWORD' });
    const ok = await registerViaInvite({ token: inv.token, name: 'Time Marketing', email: 'time@mkt.test', consent: false, password: 'senha-do-time-1' });
    expect(ok.ok).toBe(true);
    expect(await registerViaInvite({ token: inv.token, name: 'Outro Time', email: 'outro@mkt.test', consent: false, password: 'senha-do-time-2' })).toMatchObject({ ok: false, reason: 'INVITE', invite: 'FULL' });
    expect((await panelLogin('time@mkt.test', 'senha-do-time-1')).ok).toBe(false); // pendente
    const uid = (ok as { userId: string }).userId;
    await approveUser(m, uid);
    expect((await panelLogin('time@mkt.test', 'senha-do-time-1')).ok).toBe(true);
    const { loadActor } = await import('@/lib/access');
    const novo = (await loadActor(uid))!;
    expect(novo.role).toBe('MARKETING');
    // o novo marketing também pode criar campanha e convidar
    await expect(createInvite(novo, { role: 'GESTOR', distributorId: w.alfa.d.id })).resolves.toBeTruthy();
  });
  it('não desativa a si mesmo nem o último Marketing ativo', async () => {
    const { deactivateUser } = await import('@/lib/admin');
    const m = w.actor(w.marketing);
    await expect(deactivateUser(m, w.marketing.id)).rejects.toThrow(/próprio/);
    const others = await db.select().from(schema.users).where(eq(schema.users.role, 'MARKETING'));
    const novo = others.find((u) => u.email === 'time@mkt.test')!;
    await deactivateUser(m, novo.id); // há outro ativo (o próprio m): permitido
    await expect(deactivateUser(w.actor(novo), w.marketing.id)).rejects.toThrow(); // novo já inativo/sem permissão
  });
});

describe('regionais', () => {
  it('bootstrap cria as seis regionais e remove as de exemplo se ninguém as usa', async () => {
    const { bootstrap, REGIONAIS } = await import('@/lib/bootstrap');
    await db.insert(schema.regionals).values({ name: 'Sul' }).onConflictDoNothing();
    await bootstrap({ approveAllTemplates: true });
    const nomes = (await db.select().from(schema.regionals)).map((r) => r.name);
    for (const n of REGIONAIS) expect(nomes).toContain(n);
    expect(nomes).not.toContain('Sul');
  });
  it('criar, renomear, mover distribuidor e apagar só se vazia', async () => {
    const { createRegional, renameRegional, deleteRegional, setDistributorRegional } = await import('@/lib/admin');
    const id = await createRegional('Teste X');
    await expect(createRegional('Teste X')).rejects.toThrow(/Já existe/);
    await renameRegional(id, 'Teste Y');
    await setDistributorRegional(w.alfa.d.id, id);
    await expect(deleteRegional(id)).rejects.toThrow(/Mova-os/);
    await setDistributorRegional(w.alfa.d.id, w.sul.id);
    await deleteRegional(id);
    expect((await db.select().from(schema.regionals).where(eq(schema.regionals.id, id))).length).toBe(0);
  });
  it('editar e excluir canal e grupo', async () => {
    const { createDistributor, updateDistributor, deleteDistributor, updateGroup, deleteGroup } = await import('@/lib/admin');
    const id = await createDistributor({ name: 'Canal Temp', type: 'REVENDA', regionalId: w.sul.id });
    await updateDistributor(id, { name: 'Canal Temp 2', type: 'COOPERATIVA', regionalId: w.norte.id });
    const [d] = await db.select().from(schema.distributors).where(eq(schema.distributors.id, id));
    expect([d.name, d.type, d.regionalId]).toEqual(['Canal Temp 2', 'COOPERATIVA', w.norte.id]);
    await expect(updateDistributor(id, { name: w.alfa.d.name, type: 'REVENDA', regionalId: w.sul.id })).rejects.toThrow(/Já existe/);
    await expect(deleteDistributor(w.alfa.d.id)).rejects.toThrow(/usuários/);
    await deleteDistributor(id);
    expect((await db.select().from(schema.distributors).where(eq(schema.distributors.id, id))).length).toBe(0);
    const gid = await createGroup({ name: 'Grupo Temp', type: null, regionalId: null });
    await updateGroup(gid, { name: 'Grupo Temp 2', type: 'REVENDA', regionalId: w.sul.id });
    await deleteGroup(gid);
    expect((await db.select().from(schema.channelGroups).where(eq(schema.channelGroups.id, gid))).length).toBe(0);
  });
  it('dashboard gerencial: cadastrados, ativos em 7 dias e campanhas', async () => {
    const { managerDashboard } = await import('@/lib/dashboard');
    const d = await managerDashboard(w.actor(w.marketing));
    expect(d.users.sellersActive).toBeGreaterThan(0);
    expect(d.users.active7).toBeLessThanOrEqual(d.users.sellersActive);
    expect(d.weekly).toHaveLength(6);
    expect(d.health).not.toBeNull();
    const g = await managerDashboard(w.actor(w.gestor));
    expect(g.health).toBeNull();
    expect(g.users.sellersActive).toBeLessThanOrEqual(d.users.sellersActive);
  });
  it('filiais: criar, renomear e excluir só sem usuários; convite exige filial do mesmo canal', async () => {
    const { createUnit, renameUnit, deleteUnit, createInvite } = await import('@/lib/admin');
    const uid = await createUnit(w.beta.d.id, 'Filial Nova');
    await renameUnit(uid, 'Filial Nova 2', 'Equipe');
    await expect(renameUnit(uid, w.beta.us[0].name)).rejects.toThrow(/já existe/i);
    await expect(createInvite(w.actor(w.marketing), { role: 'VENDEDOR', distributorId: w.alfa.d.id, unitId: uid })).rejects.toThrow(/não pertence/);
    const inv = await createInvite(w.actor(w.marketing), { role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: uid });
    expect(inv.token).toBeTruthy();
    await deleteUnit(uid);
    expect((await db.select().from(schema.units).where(eq(schema.units.id, uid))).length).toBe(0);
    await expect(deleteUnit(w.alfa.us[0].id)).rejects.toThrow(/usuários/);
  });
  it('ranking gerencial: vendedores, distribuidores, filiais e regionais, com escopo por perfil', async () => {
    const { panelRanking } = await import('@/lib/panelRanking');
    const all = await panelRanking(w.actor(w.marketing), { campaignId });
    expect(all.sellers.length).toBeGreaterThan(0);
    const pts = all.sellers.filter((x) => x.played).map((x) => x.points);
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
    expect(all.distributors.length).toBeGreaterThan(0);
    const g = await panelRanking(w.actor(w.gestor), { campaignId });
    expect(g.distributors.every((d) => d.id === w.beta.d.id)).toBe(true);
    const sul = await panelRanking(w.actor(w.marketing), { campaignId, regionalId: w.norte.id });
    expect(sul.totalSellers).toBeLessThanOrEqual(all.totalSellers);
  });
  it('campanha por perguntas programadas: agrupa por data/hora, valida e agenda', async () => {
    const { saveCampaignPlan, planFromQuestions, loadCampaignPlan } = await import('@/lib/admin');
    const gid = (await db.select().from(schema.channelGroups))[0].id;
    const fut = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
    const q = (text: string, sendDate: string, sendTime = '10:00') => ({ sendDate, sendTime, text, options: ['A', 'B', 'C'], correct: 1 });
    const input = { name: 'Plano X', productName: 'Produto X', groupIds: [gid], questions: [q('p1', fut(10)), q('p2', fut(10)), q('p3', fut(14), '15:00')] };
    const plan = planFromQuestions(input.questions);
    expect(plan.length).toBe(2); expect(plan[0].questions.length).toBe(2);
    await expect(saveCampaignPlan(w.actor(w.marketing), null, { ...input, questions: [q('x', fut(10), '22:00')] }, true)).rejects.toThrow(/entre/);
    await expect(saveCampaignPlan(w.actor(w.marketing), null, { ...input, groupIds: [] }, true)).rejects.toThrow(/quem recebe/i);
    await expect(saveCampaignPlan(w.actor(w.marketing), null, { ...input, questions: [q('x', '2020-01-06')] }, true)).rejects.toThrow(/futuro/);
    const id = await saveCampaignPlan(w.actor(w.marketing), null, input, true);
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    expect(c.status).toBe('SCHEDULED');
    expect((await db.select().from(schema.missions).where(eq(schema.missions.campaignId, id))).length).toBe(2);
    expect((await db.select().from(schema.questions).where(eq(schema.questions.campaignId, id))).length).toBe(3);
    // rascunho: salvar, recarregar e editar
    const d = await saveCampaignPlan(w.actor(w.marketing), null, { ...input, name: 'Rascunho Y' }, false);
    const loaded = await loadCampaignPlan(d);
    expect(loaded!.plan.questions.length).toBe(3);
    await saveCampaignPlan(w.actor(w.marketing), d, { ...loaded!.plan, questions: loaded!.plan.questions.slice(0, 1) }, false);
    expect((await db.select().from(schema.questions).where(eq(schema.questions.campaignId, d))).length).toBe(1);
    await expect(saveCampaignPlan(w.actor(w.marketing), id, input, false)).rejects.toThrow(/rascunhos/);
    await expect(saveCampaignPlan(w.actor(w.gestor), null, input, false)).rejects.toThrow(/Marketing/);
  });
  it('usuários: cadastro manual, edição e exclusão com permissões', async () => {
    const { createUserManually, updateUser, deleteUser } = await import('@/lib/admin');
    const mkt = w.actor(w.marketing);
    const unit = (await db.select().from(schema.units).where(eq(schema.units.distributorId, w.beta.d.id)))[0];
    const r = await createUserManually(mkt, { name: 'Manual Um', email: 'MANUAL1@teste.com', role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: unit.id, consent: true });
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.id));
    expect([u.email, u.status, u.unitId, u.notifyOptIn]).toEqual(['manual1@teste.com', 'ACTIVE', unit.id, true]);
    await expect(createUserManually(mkt, { name: 'Dup', email: 'manual1@teste.com', role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: unit.id })).rejects.toThrow(/Já existe/);
    await expect(createUserManually(mkt, { name: 'Sem filial', email: 'sf@teste.com', role: 'VENDEDOR', distributorId: w.beta.d.id })).rejects.toThrow(/filial/i);
    await expect(createUserManually(mkt, { name: 'G', email: 'g1@teste.com', role: 'GESTOR', distributorId: w.beta.d.id, password: 'curta' })).rejects.toThrow(/senha/i);
    const g = w.actor(w.gestor);
    await expect(createUserManually(g, { name: 'X', email: 'x1@teste.com', role: 'GESTOR', distributorId: w.beta.d.id, password: 'senha-longa-1' })).rejects.toThrow(/categoria/i);
    await updateUser(mkt, r.id, { name: 'Manual Dois', email: 'manual2@teste.com', distributorId: w.beta.d.id, unitId: unit.id, active: false });
    const [u2] = await db.select().from(schema.users).where(eq(schema.users.id, r.id));
    expect([u2.name, u2.email, u2.status, u2.notifyOptIn]).toEqual(['Manual Dois', 'manual2@teste.com', 'LEFT', false]);
    await updateUser(mkt, r.id, { name: 'Manual Dois', email: 'manual2@teste.com', distributorId: w.beta.d.id, unitId: unit.id, active: true });
    expect((await db.select().from(schema.users).where(eq(schema.users.id, r.id)))[0].status).toBe('ACTIVE');
    await expect(updateUser(mkt, w.marketing.id, { name: 'M', email: 'mkt@corteva.test', active: false })).rejects.toThrow(/próprio|pelo menos/);
    await expect(deleteUser(mkt, w.marketing.id)).rejects.toThrow(/próprio/);
    await deleteUser(mkt, r.id);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, r.id))).length).toBe(0);
  });
  it('relatório filtra por regional', async () => {
    const { campaignEffectiveness } = await import('@/lib/effectiveness');
    const all = (await campaignEffectiveness(w.actor(w.marketing), { campaignId }))!;
    const sul = (await campaignEffectiveness(w.actor(w.marketing), { campaignId, regionalId: w.sul.id }))!;
    const norte = (await campaignEffectiveness(w.actor(w.marketing), { campaignId, regionalId: w.norte.id }))!;
    expect(sul.channels.every((c) => c.regionalId === w.sul.id)).toBe(true);
    expect(norte.channels.every((c) => c.regionalId === w.norte.id)).toBe(true);
    expect(all.channels.length).toBeGreaterThanOrEqual(sul.channels.length + norte.channels.length);
    expect(all.groups.some((g) => g.label === 'Centro Sul')).toBe(true);
  });
});
