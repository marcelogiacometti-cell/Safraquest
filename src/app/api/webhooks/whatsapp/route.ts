import { NextResponse } from 'next/server';
import { appSecret, handleWebhook, verifyChallenge, verifySignature } from '@/lib/whatsapp/webhook';

export async function GET(req: Request) {
  const challenge = await verifyChallenge(new URL(req.url).searchParams);
  return challenge === null ? new NextResponse('forbidden', { status: 403 }) : new NextResponse(challenge, { status: 200 });
}
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = await appSecret();
  if (!secret || !verifySignature(raw, req.headers.get('x-hub-signature-256'), secret)) return new NextResponse('invalid signature', { status: 401 });
  let body; try { body = JSON.parse(raw); } catch { return new NextResponse('bad json', { status: 400 }); }
  await handleWebhook(body);
  return NextResponse.json({ ok: true });
}
