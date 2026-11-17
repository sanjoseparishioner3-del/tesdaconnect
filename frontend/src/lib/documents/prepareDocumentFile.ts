export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.jpg,.jpeg,.png';

/** Photos above this size are re-encoded; smaller files are stored untouched. */
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
/** Long edge after downscaling: keeps IDs and certificates readable when zoomed. */
const MAX_IMAGE_EDGE_PX = 2400;
const JPEG_QUALITY = 0.85;

export class DocumentValidationError extends Error {}

function inferMimeType(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return '';
}

export function validateDocumentFile(file: File): string {
  const mime = inferMimeType(file);
  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(mime)) {
    throw new DocumentValidationError('Only PDF, JPG and PNG files are accepted.');
  }
  if (file.size <= 0) throw new DocumentValidationError('The selected file is empty.');
  return mime;
}

/**
 * Downscales large phone photos (often 4–12 MB) to a readable JPEG so they save and
 * upload quickly on low-end phones and slow data. PDFs and small images are untouched.
 * Falls back to the original file if the browser cannot decode the image.
 */
export async function compressImageIfUseful(file: File, mime: string): Promise<{ blob: Blob; mime: string; name: string }> {
  const untouched = { blob: file as Blob, mime, name: file.name };
  if (!mime.startsWith('image/') || file.size <= COMPRESS_ABOVE_BYTES) return untouched;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return untouched;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return untouched;
    ctx.fillStyle = '#ffffff'; // PNG transparency becomes white instead of black.
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return untouched;
    const name = file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
    return { blob, mime: 'image/jpeg', name };
  } catch {
    return untouched;
  }
}

/** Blob.arrayBuffer() is missing on older Safari/WebViews; FileReader works everywhere. */
function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the file.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await readAsArrayBuffer(blob));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Validates, optionally compresses, enforces the 10 MB limit and fingerprints a document. */
export async function prepareDocumentFile(file: File): Promise<{ blob: Blob; mime: string; name: string; hash: string | null }> {
  const mime = validateDocumentFile(file);
  const prepared = await compressImageIfUseful(file, mime);
  if (prepared.blob.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError('The file is larger than 10 MB. Please choose a smaller file or scan at a lower resolution.');
  }
  return { ...prepared, hash: await sha256Hex(prepared.blob) };
}
