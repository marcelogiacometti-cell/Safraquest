import { NextResponse } from 'next/server';
import { dispatchDue, retryFailed } from '@/lib/dispatch';
import { syncCampaignStatuses } from '@/lib/quiz';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
async function run(req: Request) {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!env.cronSecret || !safeEqual(given, env.cronSecret)) return new NextResponse('unauthorized', { status: 401 });
  await syncCampaignStatuses();
  const retried = await retryFailed();
  const report = await dispatchDue();
  return NextResponse.json({ retried, ...report });
}
export const GET = run;
export const POST = run;
