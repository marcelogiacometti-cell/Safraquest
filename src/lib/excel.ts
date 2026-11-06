import ExcelJS from 'exceljs';
import type { CampaignPlanInput, PlanQuestion } from './admin';

export type XlReg = { id: string; name: string };
export type XlDist = { id: string; name: string; type: 'COOPERATIVA' | 'REVENDA'; regionalId: string };
export type XlResult = { plan?: CampaignPlanInput; errors: string[]; warnings: string[] };

const LET = ['A', 'B', 'C', 'D'];
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');

export async function buildTemplate(regs: XlReg[], dists: XlDist[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = 'SafraQuest';
  const head = (ws: ExcelJS.Worksheet) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E7B4F' } }; };

  const ins = wb.addWorksheet('Instruções'); ins.getColumn(1).width = 110;
  ['COMO PREENCHER', '',
    'Hierarquia: a CAMPANHA é um conjunto de JORNADAS; cada JORNADA é um bloco de até 5 perguntas enviado de uma vez, numa data e horário.',
    '1. Aba "Campanha": preencha a coluna B (nome, tema, objetivo, link, bônus, regiões, segmentos e canais).',
    '   Regiões / Canais: separe vários nomes com ponto e vírgula (;). Deixe em branco para "todos".',
    '   Segmentos: Cooperativas, Revendas ou ambos (separados por ;). Em branco = todos.',
    '2. Aba "Jornadas": uma linha por jornada, com o número (1, 2, 3...), a data de disparo (dd/mm/aaaa) e o horário (HH:MM, entre 08:00 e 19:00). Sem disparos aos domingos.',
    '3. Aba "Perguntas": uma pergunta por linha, indicando a qual jornada (número) pertence. Até 5 perguntas por jornada. Apague as linhas "(EXEMPLO)".',
    '   Alternativas: preencha de 2 a 4 (A–D). "Correta": a letra da alternativa certa.',
    '4. Aba "Canais": lista dos nomes válidos de regiões e canais (copie exatamente).',
    '5. No painel: Campanhas → Nova campanha → "Importar de Excel". Você revisa tudo antes de finalizar.'].forEach((t, i) => { ins.getCell(i + 1, 1).value = t; });
  ins.getCell(1, 1).font = { bold: true, size: 14 };

  const c = wb.addWorksheet('Campanha'); c.columns = [{ width: 30 }, { width: 70 }, { width: 60 }];
  c.addRow(['Campo', 'Valor', 'Dica']); head(c);
  [['Nome da campanha', '', 'Ex.: Semana 43 · Lançamento Nutri+'], ['Tema / produto', '', 'Obrigatório'], ['Objetivo', '', 'Opcional'], ['Link do material', '', 'Opcional (https://...)'],
    ['Bônus de velocidade', 'Não', 'Sim ou Não'], ['Regiões', '', 'Separe por ; · em branco = todas'], ['Segmentos', '', 'Cooperativas; Revendas · em branco = todos'], ['Canais', '', 'Separe por ; · em branco = todos da região/segmento']].forEach((r) => c.addRow(r));
  c.getColumn(1).font = { bold: true };
  c.getCell('B6').dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sim,Não"'] };

  const jn = wb.addWorksheet('Jornadas'); jn.columns = [{ width: 12 }, { width: 22 }, { width: 12 }];
  jn.addRow(['Jornada', 'Data de disparo', 'Horário']); head(jn);
  jn.addRow(['(EXEMPLO) 1', '03/11/2026', '09:00']); jn.addRow(['(EXEMPLO) 2', '10/11/2026', '09:00']);

  const p = wb.addWorksheet('Perguntas');
  p.columns = [{ width: 10 }, { width: 50 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 10 }, { width: 18 }, { width: 11 }, { width: 40 }];
  p.addRow(['Jornada', 'Pergunta', 'A', 'B', 'C', 'D', 'Correta', 'Tema', 'Tempo (s)', 'Explicação']); head(p);
  p.addRow(['(EXEMPLO) 1', 'Qual a dose recomendada do produto?', '1 L/ha', '2 L/ha', '3 L/ha', '', 'B', 'Dose', 30, 'A bula indica 2 L/ha.']);
  p.addRow(['(EXEMPLO) 1', 'Quando aplicar?', 'Pré-plantio', 'Pós-emergência', '', '', 'B', 'Posicionamento', 30, '']);
  for (let r = 2; r <= 200; r++) p.getCell(r, 7).dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B,C,D"'] };
  p.views = [{ state: 'frozen', ySplit: 1 }];

  const k = wb.addWorksheet('Canais'); k.columns = [{ width: 40 }, { width: 18 }, { width: 28 }];
  k.addRow(['Canal', 'Segmento', 'Região']); head(k);
  const rn = new Map(regs.map((r) => [r.id, r.name]));
  [...dists].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach((d) => k.addRow([d.name, d.type === 'COOPERATIVA' ? 'Cooperativas' : 'Revendas', rn.get(d.regionalId) ?? '']));
  k.getCell('E1').value = 'Regiões'; k.getCell('E1').font = { bold: true };
  regs.forEach((r, i) => { k.getCell(i + 2, 5).value = r.name; }); k.getColumn(5).width = 28;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

function parseDate(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = cellText(v).replace(/^\(exemplo\)\s*/i, ''); let m;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function parseTime(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number') { const mins = Math.round((v % 1) * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
  const m = cellText(v).match(/^(\d{1,2})(?:[:h](\d{2})?)?$/i);
  if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return null;
  return `${pad(+m[1])}:${pad(+(m[2] ?? 0))}`;
}
const list = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);

export async function parseCampaignWorkbook(buf: Buffer | ArrayBuffer, regs: XlReg[], dists: XlDist[]): Promise<XlResult> {
  const errors: string[] = []; const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as ArrayBuffer); } catch { return { errors: ['Não consegui abrir o arquivo. Use o modelo .xlsx baixado no painel.'], warnings }; }
  const c = wb.getWorksheet('Campanha'); const p = wb.getWorksheet('Perguntas');
  if (!c || !p) return { errors: ['Planilha fora do modelo: faltam as abas "Campanha" e "Perguntas". Baixe o modelo novamente.'], warnings };

  const kv = new Map<string, string>();
  c.eachRow((row, n) => { if (n > 1) kv.set(norm(cellText(row.getCell(1).value)), cellText(row.getCell(2).value)); });
  const name = kv.get('nome da campanha') ?? ''; const product = kv.get('tema / produto') ?? '';
  if (!name) errors.push('Aba Campanha: preencha o "Nome da campanha".');
  if (!product) errors.push('Aba Campanha: preencha o "Tema / produto".');
  const link = kv.get('link do material') ?? '';
  if (link && !/^https?:\/\//i.test(link)) errors.push('Aba Campanha: o link do material deve começar com http:// ou https://.');

  const regIds: string[] = [];
  for (const n of list(kv.get('regioes') ?? '')) { const r = regs.find((x) => norm(x.name) === norm(n)); r ? regIds.push(r.id) : errors.push(`Aba Campanha: região "${n}" não existe (veja a aba Canais).`); }
  const types: ('COOPERATIVA' | 'REVENDA')[] = [];
  for (const n of list(kv.get('segmentos') ?? '')) {
    const t = norm(n); if (t.startsWith('coop')) types.push('COOPERATIVA'); else if (t.startsWith('revend')) types.push('REVENDA');
    else errors.push(`Aba Campanha: segmento "${n}" inválido (use Cooperativas ou Revendas).`);
  }
  const chosen: string[] = [];
  const named = list(kv.get('canais') ?? '');
  if (named.length) {
    for (const n of named) { const d = dists.find((x) => norm(x.name) === norm(n)); d ? chosen.push(d.id) : errors.push(`Aba Campanha: canal "${n}" não encontrado (veja a aba Canais).`); }
    for (const id of chosen) { const d = dists.find((x) => x.id === id)!; if ((regIds.length && !regIds.includes(d.regionalId)) || (types.length && !types.includes(d.type))) warnings.push(`O canal "${d.name}" está fora da região/segmento informados, mas foi mantido.`); }
  } else for (const d of dists) if ((!regIds.length || regIds.includes(d.regionalId)) && (!types.length || types.includes(d.type))) chosen.push(d.id);
  if (!chosen.length && !errors.length) errors.push('Nenhum canal corresponde à região/segmento informados.');
  const bonus = norm(kv.get('bonus de velocidade')); 

  const jw = wb.getWorksheet('Jornadas');
  if (!jw) return { errors: ['Planilha fora do modelo: falta a aba "Jornadas". Baixe o modelo novamente.'], warnings };
  const journeys = new Map<number, { date: string; time: string }>(); const seenSlot = new Set<string>();
  jw.eachRow((row, n) => {
    if (n === 1) return;
    const raw = [1, 2, 3].map((i) => cellText(row.getCell(i).value));
    if (!raw.some(Boolean) || /^\(exemplo\)/i.test(raw[0])) return;
    const at = `Jornadas, linha ${n}`; const num = parseInt(raw[0], 10);
    const date = parseDate(row.getCell(2).value); const time = parseTime(row.getCell(3).value);
    const before = errors.length;
    if (!Number.isInteger(num) || num < 1) errors.push(`${at}: informe o número da jornada (1, 2, 3...).`);
    else if (journeys.has(num)) errors.push(`${at}: a jornada ${num} aparece duas vezes.`);
    if (!date) errors.push(`${at}: data inválida (use dd/mm/aaaa).`);
    else if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) errors.push(`${at}: ${date.split('-').reverse().join('/')} é domingo — não há disparo aos domingos.`);
    if (!time) errors.push(`${at}: horário inválido (use HH:MM).`);
    else if (time < '08:00' || time > '19:00') errors.push(`${at}: o horário precisa estar entre 08:00 e 19:00.`);
    if (errors.length > before) return;
    const slot = date + ' ' + time; if (seenSlot.has(slot)) { errors.push(`${at}: já existe outra jornada nesse dia e horário.`); return; }
    seenSlot.add(slot); journeys.set(num, { date: date!, time: time! });
  });
  if (!journeys.size && !errors.some((e) => e.startsWith('Jornadas'))) errors.push('Aba Jornadas: cadastre pelo menos uma jornada (linhas "(EXEMPLO)" são ignoradas).');

  const questions: PlanQuestion[] = []; const perJ = new Map<number, number>();
  p.eachRow((row, n) => {
    if (n === 1) return;
    const raw = [1, 2, 3, 4, 5, 6, 7].map((i) => cellText(row.getCell(i).value));
    if (!raw.some(Boolean)) return;
    if (/^\(exemplo\)/i.test(raw[0])) return;
    const at = `Perguntas, linha ${n}`;
    const num = parseInt(raw[0], 10); const j = journeys.get(num);
    const text = raw[1]; const opts = [raw[2], raw[3], raw[4], raw[5]];
    const letter = raw[6].toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
    const before = errors.length;
    if (!Number.isInteger(num)) errors.push(`${at}: informe a jornada (número).`);
    else if (!j) errors.push(`${at}: a jornada ${num} não está cadastrada na aba Jornadas.`);
    if (!text) errors.push(`${at}: falta o enunciado da pergunta.`);
    const filled = opts.filter(Boolean);
    if (filled.length < 2) errors.push(`${at}: preencha pelo menos 2 alternativas.`);
    if (new Set(filled.map(norm)).size !== filled.length) errors.push(`${at}: há alternativas repetidas.`);
    const ci = letter ? LET.indexOf(letter) : -1;
    if (ci < 0) errors.push(`${at}: informe a alternativa correta (A a D).`);
    else if (!opts[ci]) errors.push(`${at}: a alternativa correta (${letter}) está em branco.`);
    if (errors.length > before || !j) return;
    const tl = Number(cellText(row.getCell(9).value)); const timeLimit = Number.isFinite(tl) && tl >= 5 && tl <= 300 ? Math.round(tl) : 30;
    perJ.set(num, (perJ.get(num) ?? 0) + 1);
    questions.push({ sendDate: j.date, sendTime: j.time, text, options: filled, correct: opts.slice(0, ci).filter(Boolean).length, explanation: cellText(row.getCell(10).value) || undefined, topic: cellText(row.getCell(8).value) || undefined, timeLimit });
  });
  for (const [num, n] of perJ) if (n > 5) errors.push(`A jornada ${num} tem ${n} perguntas — o máximo é 5 por jornada.`);
  for (const num of journeys.keys()) if (!perJ.has(num) && !errors.some((e) => e.startsWith('Perguntas'))) errors.push(`A jornada ${num} não tem perguntas na aba Perguntas.`);
  if (!questions.length && !errors.some((e) => e.startsWith('Perguntas') || e.startsWith('Jornadas') || e.startsWith('A jornada'))) errors.push('Aba Perguntas: nenhuma pergunta preenchida (linhas "(EXEMPLO)" são ignoradas).');
  if (errors.length) return { errors, warnings };
  return { errors, warnings, plan: { name, productName: product, objective: kv.get('objetivo') || '', materialUrl: link, speedBonus: ['sim', 's', 'true', '1'].includes(bonus), audience: { regionalIds: regIds, types, distributorIds: chosen }, questions } };
}
