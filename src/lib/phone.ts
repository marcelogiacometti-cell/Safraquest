/** Normaliza um WhatsApp brasileiro para o formato internacional só com dígitos (55 + DDD + número). */
export function normalizePhone(input: string): string | null {
  let d = (input ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) {
    const ddd = d.slice(0, 2);
    if (Number(ddd) < 11) return null;
    let num = d.slice(2);
    if (num.length === 8 && /^[6-9]/.test(num)) num = '9' + num; // celular antigo sem o nono dígito
    if (num.length === 9 && num[0] !== '9') return null;
    if (num.length !== 8 && num.length !== 9) return null;
    return '55' + ddd + num;
  }
  return null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
