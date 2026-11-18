/**
 * iPhone photos (HEIC/HEIF): only Safari can show them and our AI can't read them, so they are
 * turned into JPEG here, in the browser, before they are uploaded. Every upload goes through
 * toUploadableFile (see services/api.ts), so no screen has to think about it.
 *
 * The converter is large and only loaded when someone actually picks such a photo.
 */
import type { Accept } from 'react-dropzone';

/** Longest side of the JPEG we upload: plenty for a ticket or receipt, and it keeps the file small */
const MAX_SIDE = 3000;
const JPEG_QUALITY = 0.9;

/**
 * iPhones and iPads turn their photos into JPEG themselves in the photo picker, as long as the
 * page doesn't ask for HEIC. That is faster than converting on the phone, so there we don't ask.
 */
export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const HEIC_EXTENSIONS = ['.heic', '.heif'];

/** For <input accept="…">: also offer iPhone photos in the file window (except on iPhones, see isIOS) */
export function acceptWithIphonePhotos(accept: string): string {
  return isIOS ? accept : `${accept},${HEIC_EXTENSIONS.join(',')},image/heic,image/heif`;
}

/** The same for a react-dropzone "accept" */
export function dropzoneAcceptWithIphonePhotos(accept: Accept): Accept {
  return isIOS ? accept : { ...accept, 'image/heic': ['.heic'], 'image/heif': ['.heif'] };
}

/** The start of a file (older browsers have no Blob.arrayBuffer, so there is a FileReader fallback) */
function firstBytes(file: Blob, count: number): Promise<Uint8Array> {
  const part = file.slice(0, count);
  if (typeof part.arrayBuffer === 'function') return part.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(part);
  });
}

/** HEVC image brands, and the generic HEIF brands that need a look at the compatible brands */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const GENERIC_HEIF_BRANDS = new Set(['mif1', 'msf1']);

/**
 * True for a HEIC/HEIF photo, judged by the file itself: an iPhone photo renamed to .jpg is
 * still one, and Windows often reports no type at all for a .heic file.
 */
export async function isIphonePhoto(file: Blob): Promise<boolean> {
  if (file.size < 16) return false;
  let bytes: Uint8Array;
  try {
    bytes = await firstBytes(file, 64);
  } catch {
    return false;
  }
  const text = (from: number) => String.fromCharCode(...bytes.slice(from, from + 4));
  if (text(4) !== 'ftyp') return false;
  const major = text(8);
  if (HEIC_BRANDS.has(major)) return true;
  if (!GENERIC_HEIF_BRANDS.has(major)) return false;
  // Generic HEIF: HEIC when one of the compatible brands says so (AVIF files list "avif" instead)
  const boxSize = Math.min(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0), bytes.length);
  for (let at = 16; at + 4 <= boxSize; at += 4) {
    if (HEIC_BRANDS.has(text(at))) return true;
  }
  return false;
}

/** "IMG_4086.HEIC" → "IMG_4086.jpg" */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.jpg`;
}

export class PhotoConversionError extends Error {}

/**
 * The file to upload: an iPhone photo becomes a JPEG, anything else is returned as it is.
 * Throws PhotoConversionError (with a message for the person uploading) when it can't be converted.
 */
export async function toUploadableFile(file: File): Promise<File> {
  if (!(await isIphonePhoto(file))) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // The build that works under a strict content security policy (no eval)
    const { heicTo } = await import('heic-to/csp');
    bitmap = await heicTo({ blob: file, type: 'bitmap' });

    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not save the photo'))), 'image/jpeg', JPEG_QUALITY)
    );
    // Hand the memory back straight away: these photos are large
    canvas.width = 1;
    canvas.height = 1;

    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (err) {
    console.error('[Upload] Could not convert the iPhone photo', file.name, err);
    throw new PhotoConversionError(
      `"${file.name}" is an iPhone photo (HEIC) that could not be converted. Take a screenshot of it, or save it as JPG, and upload that instead.`
    );
  } finally {
    bitmap?.close();
  }
}
