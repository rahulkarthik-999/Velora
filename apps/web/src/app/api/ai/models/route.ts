import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, serverError, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';
import { availableModels, planRoute } from '@/lib/ai/models';
import { getUsageSummary } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * Models the caller may pass as `model` on AI requests, plus the defaults
 * used when they don't. Only models whose provider key is configured appear.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = (await getDesktopCaller(req))?.userId ?? (await getAuthenticatedUser())?.id;
    if (!userId) return unauthorized();

    const { tier } = await getUsageSummary(userId);
    const defaults = Object.fromEntries(
      (['chat', 'realtime', 'reasoning', 'vision'] as const).map((task) => [task, planRoute({ task })[0]?.id ?? null])
    );
    return NextResponse.json({
      models: availableModels(tier).map((m) => ({ id: m.id, label: m.label, provider: m.provider, vision: m.vision })),
      defaults,
    });
  } catch (error) {
    console.error('[GET /api/ai/models]', error);
    return serverError();
  }
}
