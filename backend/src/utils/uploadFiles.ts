/**
 * What to tell someone whose file type we can't take.
 *
 * iPhone photos (HEIC) are turned into JPEG in the browser before they are uploaded
 * (frontend/src/utils/iphonePhotos.ts), so one arriving here means the page is an old copy.
 */
export function unsupportedFileMessage(file: { originalname?: string; mimetype?: string }, allowed: string): string {
  const name = file.originalname || 'This file';
  const isIphonePhoto = /\.hei[cf]$/i.test(file.originalname || '') || /^image\/hei[cf]/i.test(file.mimetype || '');
  if (isIphonePhoto) {
    return `"${name}" is an iPhone photo (HEIC) that was not converted. Refresh this page and try again, or upload a screenshot or JPG instead.`;
  }
  return `"${name}" can't be uploaded here. Use ${allowed}.`;
}
