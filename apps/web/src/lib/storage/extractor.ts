import { inflateRawSync } from 'zlib';

export interface ExtractionResult {
  text: string;
  isScannedOrImageOnly: boolean;
  truncated: boolean;
  wordCount: number;
}

const MAX_EXTRACTED_CHARS = 40000;

export async function extractDocumentContent(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult> {
  const lowerName = fileName.toLowerCase();

  // 1. Text-based files (TXT, MD, CSV, JSON)
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.json')
  ) {
    const raw = buffer.toString('utf-8');
    const truncated = raw.length > MAX_EXTRACTED_CHARS;
    const text = raw.slice(0, MAX_EXTRACTED_CHARS);
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      text,
      isScannedOrImageOnly: false,
      truncated,
      wordCount: words,
    };
  }

  // 2. DOCX Documents (ZIP archive containing word/document.xml)
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    try {
      const docxText = extractDocxText(buffer);
      if (docxText.trim().length > 0) {
        const truncated = docxText.length > MAX_EXTRACTED_CHARS;
        const text = docxText.slice(0, MAX_EXTRACTED_CHARS);
        const words = text.split(/\s+/).filter(Boolean).length;
        return {
          text,
          isScannedOrImageOnly: false,
          truncated,
          wordCount: words,
        };
      }
    } catch (err) {
      console.warn('[DOCX Extract Warning]', err);
    }
  }

  // 3. PDF Documents
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    try {
      return extractPdfText(buffer);
    } catch (err) {
      console.warn('[PDF Extract Warning]', err);
      return {
        text: `[PDF Parsing Notice: Could not extract machine-readable text from ${fileName}. The document may be encrypted, scanned, or image-only.]`,
        isScannedOrImageOnly: true,
        truncated: false,
        wordCount: 0,
      };
    }
  }

  // 4. Images (PNG, JPG, JPEG, WEBP)
  if (mimeType.startsWith('image/')) {
    return {
      text: `[Visual Asset: ${fileName} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB) attached as visual reference for workflow execution.]`,
      isScannedOrImageOnly: true,
      truncated: false,
      wordCount: 0,
    };
  }

  // 5. Default / Fallback
  return {
    text: `[Document: ${fileName} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB)]`,
    isScannedOrImageOnly: false,
    truncated: false,
    wordCount: 0,
  };
}

/**
 * Extracts plain text from a .docx buffer by reading `word/document.xml` from the ZIP central directory / local headers.
 */
function extractDocxText(buffer: Buffer): string {
  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Not a valid ZIP/DOCX archive');
  }

  const cdEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let i = 0; i < cdEntries && ptr + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const entryName = buffer.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf-8');

    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (entryName === 'word/document.xml') {
      if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Invalid local file header in DOCX');
      }
      const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedSlice = buffer.subarray(dataStart, dataStart + compressedSize);

      const xmlBuffer =
        compressionMethod === 0
          ? compressedSlice
          : compressionMethod === 8
            ? inflateRawSync(compressedSlice)
            : null;
      if (!xmlBuffer) throw new Error(`Unsupported DOCX compression method: ${compressionMethod}`);

      const xml = xmlBuffer.toString('utf-8');
      return xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br[^/>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  throw new Error('word/document.xml not found in DOCX');
}

/**
 * Robust extraction of text streams from PDF buffer
 */
function extractPdfText(buffer: Buffer): ExtractionResult {
  const content = buffer.toString('latin1');

  // Extract text within standard PDF text blocks: BT ... ET
  const textBlocks: string[] = [];
  const btRegex = /BT[\s\S]*?ET/g;
  let match: RegExpExecArray | null;

  while ((match = btRegex.exec(content)) !== null) {
    const block = match[0];

    // Extract strings enclosed in parentheses: (Hello World) Tj or TJ
    const strRegex = /\(([\s\S]*?)\)\s*(?:Tj|TJ|'|")/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\r/g, ' ')
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ');
      if (decoded.trim()) {
        textBlocks.push(decoded);
      }
    }
  }

  const combined = textBlocks.join(' ').replace(/\s+/g, ' ').trim();

  // If text blocks found
  if (combined.length > 50) {
    const truncated = combined.length > MAX_EXTRACTED_CHARS;
    const text = combined.slice(0, MAX_EXTRACTED_CHARS);
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      text,
      isScannedOrImageOnly: false,
      truncated,
      wordCount: words,
    };
  }

  // Check if PDF contains image streams without text (scanned PDF)
  const hasImages = content.includes('/Image') || content.includes('/XObject') || content.includes('/DCTDecode');
  if (hasImages) {
    return {
      text: '[Scanned PDF: Document contains image-only pages without an embedded text layer. Please provide text or an OCR-processed copy for detailed extraction.]',
      isScannedOrImageOnly: true,
      truncated: false,
      wordCount: 0,
    };
  }

  return {
    text: '[PDF Document: Minimal text layer detected. Provide a text brief or editable document.]',
    isScannedOrImageOnly: false,
    truncated: false,
    wordCount: 0,
  };
}
