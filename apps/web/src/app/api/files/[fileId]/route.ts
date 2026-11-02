import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, notFound, serverError } from '@/lib/api-utils';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: params.fileId },
    });

    if (!attachment) return notFound('File not found');

    // Strict multi-tenant authorization
    if (attachment.userId !== user.id) {
      return unauthorized();
    }

    const storageProvider = getStorageProvider();
    const buffer = await storageProvider.read(attachment.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': attachment.fileType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[File Download API Error]', error);
    return serverError('Could not retrieve file');
  }
}
