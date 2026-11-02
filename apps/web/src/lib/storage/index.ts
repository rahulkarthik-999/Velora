import prisma from '@/lib/db';

export interface StorageFile {
  buffer: Buffer;
  mimeType: string;
  size: number;
  fileName: string;
}

export interface FileStorageProvider {
  save(userId: string, fileId: string, fileName: string, buffer: Buffer, mimeType: string): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

/**
 * Postgres Storage Provider
 * Stores file bytes in the app database (Neon or Supabase Postgres), so uploads
 * work on Vercel's read-only filesystem without a separate storage service.
 * Files are only reachable through the authenticated /api/files route.
 */
export class PostgresStorageProvider implements FileStorageProvider {
  async save(
    userId: string,
    fileId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${userId}/${fileId}-${safeName}`;

    await prisma.storedFile.create({
      data: { key, userId, mimeType, size: buffer.length, data: new Uint8Array(buffer) },
    });

    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    const file = await prisma.storedFile.findUnique({ where: { key: storageKey }, select: { data: true } });
    if (!file) {
      throw new Error(`Storage file not found: ${storageKey}`);
    }
    return Buffer.from(file.data);
  }

  async delete(storageKey: string): Promise<void> {
    await prisma.storedFile.deleteMany({ where: { key: storageKey } });
  }

  async exists(storageKey: string): Promise<boolean> {
    const count = await prisma.storedFile.count({ where: { key: storageKey } });
    return count > 0;
  }
}

let storageInstance: FileStorageProvider | null = null;

export function getStorageProvider(): FileStorageProvider {
  if (!storageInstance) {
    storageInstance = new PostgresStorageProvider();
  }
  return storageInstance;
}
