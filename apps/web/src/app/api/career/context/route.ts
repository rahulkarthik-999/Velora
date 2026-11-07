import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkRateLimit, rateLimitError, unauthorized } from '@/lib/api-utils';
import { resolveApiCaller } from '@/lib/practice';
import { extractDocumentContent } from '@/lib/storage/extractor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set([
  'career:profile',
  'career:resumes',
  'career:resume_analysis',
  'career:resume_versions',
  'career:jobs',
  'career:job_matches',
  'career:mock_interviews',
  'career:reports',
  'career:roadmap',
  'career:knowledge',
  'career:assistants',
]);

async function upsertContextBody(
  userId: string,
  body: { key?: string; data?: unknown; entries?: Record<string, unknown> }
): Promise<NextResponse> {
  if (body.entries && typeof body.entries === 'object') {
    const updates: Array<{ key: string; value: string }> = [];
    for (const [k, v] of Object.entries(body.entries)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      const serialized = JSON.stringify(v ?? null);
      if (serialized.length > 500_000) {
        return NextResponse.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: `Context entry ${k} exceeds size limit.` } },
          { status: 413 }
        );
      }
      updates.push({ key: k, value: serialized });
    }
    for (const u of updates) {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId, key: u.key } },
        update: { value: u.value },
        create: { userId, key: u.key, value: u.value },
      });
    }
    return NextResponse.json({ ok: true, updatedKeys: updates.map((u) => u.key) });
  }

  if (!body.key || !ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json({ error: { code: 'INVALID_KEY', message: 'Valid key is required.' } }, { status: 400 });
  }

  const serialized = JSON.stringify(body.data ?? null);
  if (serialized.length > 500_000) {
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Context entry exceeds 500KB limit.' } },
      { status: 413 }
    );
  }

  const saved = await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: body.key } },
    update: { value: serialized },
    create: { userId, key: body.key, value: serialized },
  });

  return NextResponse.json({ ok: true, key: saved.key });
}

export async function GET(req: NextRequest) {
  const caller = await resolveApiCaller(req);
  if (!caller) return unauthorized();
  if (!checkRateLimit(`career-context-get:${caller.userId}`, 60, 60_000)) return rateLimitError();

  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if (key) {
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: { code: 'INVALID_KEY', message: 'Invalid career context key.' } }, { status: 400 });
    }
    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: caller.userId, key } },
    });
    let parsed: unknown = null;
    if (pref?.value) {
      try {
        parsed = JSON.parse(pref.value);
      } catch {
        parsed = null;
      }
    }
    return NextResponse.json({ key, data: parsed });
  }

  const prefs = await prisma.userPreference.findMany({
    where: {
      userId: caller.userId,
      key: { in: Array.from(ALLOWED_KEYS) },
    },
  });

  const context: Record<string, unknown> = {};
  for (const p of prefs) {
    try {
      context[p.key] = JSON.parse(p.value);
    } catch {
      context[p.key] = null;
    }
  }

  return NextResponse.json({ context });
}

export async function PUT(req: NextRequest) {
  const caller = await resolveApiCaller(req);
  if (!caller) return unauthorized();
  if (!checkRateLimit(`career-context-put:${caller.userId}`, 40, 60_000)) return rateLimitError();

  let body: { key?: string; data?: unknown; entries?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } }, { status: 400 });
  }

  return upsertContextBody(caller.userId, body);
}

export async function POST(req: NextRequest) {
  const caller = await resolveApiCaller(req);
  if (!caller) return unauthorized();
  if (!checkRateLimit(`career-context-post:${caller.userId}`, 40, 60_000)) return rateLimitError();

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      return upsertContextBody(caller.userId, body);
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } }, { status: 400 });
    }
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: 'MISSING_FILE', message: 'Missing file field in multipart form.' } }, { status: 400 });
    }
    const allowedExt = /\.(pdf|docx|txt|md|csv|json)$/i.test(file.name || '');
    if (!allowedExt && !file.type.startsWith('text/') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'Only PDF, DOCX, TXT, and MD files are allowed.' } },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 10MB limit.' } }, { status: 413 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extracted = await extractDocumentContent(buffer, file.type || 'application/octet-stream', file.name || 'document.pdf');
    return NextResponse.json({
      fileName: file.name,
      text: extracted.text,
      wordCount: extracted.wordCount,
      isScannedOrImageOnly: extracted.isScannedOrImageOnly,
      truncated: extracted.truncated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'EXTRACTION_FAILED', message: err instanceof Error ? err.message : 'Failed to extract document text.' } },
      { status: 500 }
    );
  }
}
