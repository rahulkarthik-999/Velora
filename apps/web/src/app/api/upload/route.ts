import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, badRequest, serverError, checkRateLimit } from '@/lib/api-utils';
import { AllowedFileTypes, MAX_FILE_SIZE, TIER_LIMITS, type SubscriptionTier } from '@velora/schemas';
import { v4 as uuid } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

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

    // Verify file size
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check user tier limits
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const tier: SubscriptionTier = (sub?.tier as SubscriptionTier) || 'FREE';
    const limits = TIER_LIMITS[tier];

    if (file.size > limits.maxFileSize) {
      return badRequest(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds your plan limit of ${limits.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check if task exists and belongs to user if taskId is passed
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.userId !== user.id) {
        return badRequest('Invalid or unauthorized task ID');
      }
    }

    // Validate mime type
    const mimeType = file.type || 'application/octet-stream';
    const isAllowed = AllowedFileTypes.safeParse(mimeType).success ||
      ['text/plain', 'text/markdown', 'text/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType);

    if (!isAllowed) {
      return badRequest(`File format ${mimeType} is not supported. Supported: PDF, PNG, JPEG, WebP, TXT, Markdown, CSV, DOCX, XLSX`);
    }

    // Read bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Text extraction if text-like
    let extractedText: string | undefined;
    if (mimeType.startsWith('text/') || mimeType === 'text/markdown' || mimeType === 'text/csv') {
      extractedText = buffer.toString('utf-8').slice(0, 50000); // bounded extraction
    } else if (mimeType === 'application/pdf') {
      // Basic text heuristic / placeholder extraction for PDF bytes (avoiding binary junk)
      const asciiOnly = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      const cleanWords = asciiOnly.split(/\s+/).filter(w => w.length > 2 && w.length < 30).slice(0, 1500).join(' ');
      if (cleanWords.length > 50) {
        extractedText = `Extracted textual fragments from ${file.name}:\n${cleanWords}`;
      } else {
        extractedText = `[PDF Document: ${file.name}, Size: ${(file.size / 1024).toFixed(1)} KB]`;
      }
    } else if (mimeType.startsWith('image/')) {
      extractedText = `[Image Asset: ${file.name}, MIME: ${mimeType}, Size: ${(file.size / 1024).toFixed(1)} KB]`;
    }

    // Generate unique storage key
    const fileId = uuid();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `uploads/${user.id}/${fileId}-${safeName}`;

    // Write file to local uploads directory for development/serverless persistence
    const localUploadDir = join(process.cwd(), 'public', 'uploads', user.id);
    await mkdir(localUploadDir, { recursive: true });
    await writeFile(join(localUploadDir, `${fileId}-${safeName}`), buffer);

    // Save attachment in database
    const attachment = await prisma.taskAttachment.create({
      data: {
        id: fileId,
        userId: user.id,
        taskId: taskId || undefined,
        fileName: file.name,
        fileType: mimeType,
        fileSize: file.size,
        storageKey,
        extractedText,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error('[Upload error]', error);
    return serverError('Failed to process upload');
  }
}
