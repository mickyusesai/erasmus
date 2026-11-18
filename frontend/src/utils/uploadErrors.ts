/**
 * What to tell someone when a file can't be added. An upload that fails without a reason
 * ("Failed to upload") or a file that is silently ignored leaves people guessing.
 */
import type { FileRejection } from 'react-dropzone';

const NOT_A_REASON = new Set(['', 'An error occurred', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']);

/** The reason an upload failed: the server's or ours when there is one, otherwise the fallback */
export function uploadErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  return NOT_A_REASON.has(message) ? fallback : message;
}

/** Why the file window or drop area refused files (react-dropzone rejections) */
export function rejectionMessage(rejections: FileRejection[], options: { maxMb?: number; allowed?: string } = {}): string {
  const maxMb = options.maxMb ?? 10;
  const allowed = options.allowed ?? 'a PDF, a photo or a screenshot';
  const reasonFor = (r: FileRejection): string => {
    const codes = r.errors.map((e) => e.code);
    if (codes.includes('file-too-large')) return `"${r.file.name}" is larger than ${maxMb} MB. Try a smaller photo, a screenshot or a compressed PDF.`;
    if (codes.includes('file-invalid-type')) return `"${r.file.name}" can't be uploaded here. Use ${allowed}.`;
    if (codes.includes('too-many-files')) return 'Please add one file at a time here.';
    return `"${r.file.name}" could not be added.`;
  };
  if (rejections.length === 0) return '';
  if (rejections.length === 1) return reasonFor(rejections[0]);
  if (rejections.every((r) => r.errors.some((e) => e.code === 'too-many-files'))) return 'Please add one file at a time here.';
  // Several files: name the first reason and count the rest
  return `${rejections.length} files could not be added. ${reasonFor(rejections[0])}`;
}
