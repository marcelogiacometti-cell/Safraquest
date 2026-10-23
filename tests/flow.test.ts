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
    const bad = await registerViaInvite({ token: inv.token, name: 'Carlos', whatsapp: '(54) 99999-0001', consent: true });
    expect(bad).toMatchObject({ ok: false, reason: 'NAME' });
    const noConsent = await registerViaInvite({ token: inv.token, name: 'Carlos Menezes', whatsapp: '(54) 99999-0001', consent: false });
    expect(noConsent).toMatchObject({ ok: false, reason: 'CONSENT' });
    const ok = await registerViaInvite({ token: inv.token, name: 'Carlos Menezes', whatsapp: '(54) 99999-0001', consent: true });
    expect(ok.ok).toBe(true);
    const dup = await registerViaInvite({ token: inv.token, name: 'Outro Carlos', whatsapp: '54999990001', consent: true });
    expect(dup).toMatchObject({ ok: false, reason: 'DUPLICATE' });

    // pendente não consegue pedir código
    expect(await requestLoginCode('(54) 99999-0001')).toMatchObject({ ok: false, reason: 'PENDING' });
    const u = (await db.select().from(schema.users).where(eq(schema.users.whatsapp, '5554999990001')))[0];
    const res = await approveUser(g, u.id);
    expect(res.notified).toBe(true);
    expect(consoleOutbox.some((m) => m.template === 'cadastro_aprovado')).toBe(true);
    await expect(approveUser(g, u.id)).rejects.toThrow(/já foi decidido/);
    expect((await requestLoginCode('(54) 99999-0001')).ok).toBe(true);
  });

  it('limite de usos do link e link vencido', async () => {
    const g = w.actor(w.gestor);
    const inv = await createInvite(g, { role: 'VENDEDOR', distributorId: w.beta.d.id, unitId: w.beta.us[1].id, maxUses: 1 });
    await registerViaInvite({ token: inv.token, name: 'Ana Souza', whatsapp: '54999990002', consent: true });
    const full = await registerViaInvite({ token: inv.token, name: 'Bia Souza', whatsapp: '54999990003', consent: true });
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
    const phone = u.whatsapp!;
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
    expect(await requestLoginCode('123')).toMatchObject({ ok: false, reason: 'INVALID_PHONE' });
    expect(await requestLoginCode('(54) 91111-9999')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
    const u = await addSeller(w.beta.d.id, w.beta.us[0].id, 'Spam Teste');
    for (let i = 0; i < 3; i++) expect((await requestLoginCode(u.whatsapp!)).ok).toBe(true);
    expect(await requestLoginCode(u.whatsapp!)).toMatchObject({ ok: false, reason: 'RATE_LIMIT' });
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

    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, log.userId));
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
