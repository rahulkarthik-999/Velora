import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, badRequest, serverError, checkRateLimit } from '@/lib/api-utils';
import { AllowedFileTypes, MAX_FILE_SIZE, TIER_LIMITS, type SubscriptionTier } from '@velora/schemas';
import { v4 as uuid } from 'uuid';
import { getStorageProvider } from '@/lib/storage';
import { extractDocumentContent } from '@/lib/storage/extractor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    if (!checkRateLimit(`upload:${user.id}`, 20, 60000)) {
      return NextResponse.json({ error: 'Too many upload requests. Please slow down.' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const taskId = formData.get('taskId') as string | null;

    if (!file) {
      return badRequest('No file provided');
    }

    // Verify absolute hard max
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check plan tier limits
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const tier: SubscriptionTier = (sub?.tier as SubscriptionTier) || 'FREE';
    const limits = TIER_LIMITS[tier];

    if (file.size > limits.maxFileSize) {
      return badRequest(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds your ${tier} plan limit of ${
          limits.maxFileSize / (1024 * 1024)
        }MB. Upgrade for larger file processing.`
      );
    }

    // Check task ownership if taskId is supplied
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.userId !== user.id) {
        return badRequest('Invalid or unauthorized task ID');
      }
    }

    // Validate MIME type
    const mimeType = file.type || 'application/octet-stream';
    const isAllowed =
      AllowedFileTypes.safeParse(mimeType).success ||
      [
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/json',
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
      ].includes(mimeType);

    if (!isAllowed) {
      return badRequest(`File format ${mimeType} is not supported. Supported: PDF, PNG, JPEG, WebP, TXT, MD, CSV, JSON`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text safely without exposing untrusted instructions
    const extraction = await extractDocumentContent(buffer, mimeType, file.name);

    // Persist securely to private storage
    const fileId = uuid();
    const storageProvider = getStorageProvider();
    const storageKey = await storageProvider.save(user.id, fileId, file.name, buffer, mimeType);

    // Record attachment in database
    const attachment = await prisma.taskAttachment.create({
      data: {
        id: fileId,
        userId: user.id,
        taskId: taskId || undefined,
        fileName: file.name,
        fileType: mimeType,
        fileSize: file.size,
        storageKey,
        extractedText: extraction.text,
      },
    });

    return NextResponse.json(
      {
        id: attachment.id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        extractedTextPreview: extraction.text.slice(0, 300),
        isScanned: extraction.isScannedOrImageOnly,
        wordCount: extraction.wordCount,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Upload API Error]', error);
    return serverError('Failed to process upload securely');
  }
}
