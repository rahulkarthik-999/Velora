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
  // 1. Text-based files (TXT, MD, CSV, JSON)
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/json' ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.json')
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

  // 2. PDF Documents
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
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

  // 3. Images (PNG, JPG, JPEG, WEBP)
  if (mimeType.startsWith('image/')) {
    return {
      text: `[Visual Asset: ${fileName} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB) attached as visual reference for workflow execution.]`,
      isScannedOrImageOnly: true,
      truncated: false,
      wordCount: 0,
    };
  }

  // 4. Default / Fallback
  return {
    text: `[Document: ${fileName} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB)]`,
    isScannedOrImageOnly: false,
    truncated: false,
    wordCount: 0,
  };
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
