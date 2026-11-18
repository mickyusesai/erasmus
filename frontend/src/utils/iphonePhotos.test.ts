import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptWithIphonePhotos, dropzoneAcceptWithIphonePhotos, isIphonePhoto, jpegName, toUploadableFile } from './iphonePhotos';

/** The start of an ISO media file: size, "ftyp", major brand, minor version, compatible brands */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  const bytes = new Uint8Array(size + 24); // some payload after the box
  new DataView(bytes.buffer).setUint32(0, size);
  const put = (text: string, at: number) => [...text].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
  put('ftyp', 4);
  put(major, 8);
  compatible.forEach((brand, i) => put(brand, 16 + i * 4));
  return bytes;
}

const file = (bytes: Uint8Array | number[], name: string, type = '') => new File([new Uint8Array(bytes)], name, { type });

describe('isIphonePhoto', () => {
  it('recognises an iPhone photo by the file itself', async () => {
    expect(await isIphonePhoto(file(ftyp('heic', ['mif1', 'MiHE', 'miaf', 'heic']), 'IMG_4086.HEIC'))).toBe(true);
    expect(await isIphonePhoto(file(ftyp('heix'), 'photo.heic', 'image/heic'))).toBe(true);
  });

  it('recognises one that was renamed to .jpg or .png', async () => {
    expect(await isIphonePhoto(file(ftyp('heic', ['mif1', 'heic']), 'ticket.jpg', 'image/jpeg'))).toBe(true);
    expect(await isIphonePhoto(file(ftyp('heic', ['mif1', 'heic']), 'ticket.png', 'image/png'))).toBe(true);
  });

  it('recognises a generic HEIF file that lists a HEIC brand (some Android phones)', async () => {
    expect(await isIphonePhoto(file(ftyp('mif1', ['mif1', 'heic']), 'photo.heic'))).toBe(true);
  });

  it('leaves AVIF alone, also with a generic HEIF brand', async () => {
    expect(await isIphonePhoto(file(ftyp('avif', ['mif1', 'miaf']), 'photo.avif', 'image/avif'))).toBe(false);
    expect(await isIphonePhoto(file(ftyp('mif1', ['avif', 'miaf']), 'photo.avif', 'image/avif'))).toBe(false);
  });

  it('leaves JPG, PNG, PDF and video alone', async () => {
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1];
    const pdf = [...'%PDF-1.7\n1 0 obj\n<< >>\nendobj\n'].map((c) => c.charCodeAt(0));
    expect(await isIphonePhoto(file(jpeg, 'a.jpg', 'image/jpeg'))).toBe(false);
    expect(await isIphonePhoto(file(png, 'a.png', 'image/png'))).toBe(false);
    expect(await isIphonePhoto(file(pdf, 'a.pdf', 'application/pdf'))).toBe(false);
    expect(await isIphonePhoto(file(ftyp('isom', ['isom', 'mp42']), 'clip.mp4', 'video/mp4'))).toBe(false);
  });

  it('is not fooled by a file name or an empty file', async () => {
    expect(await isIphonePhoto(file([1, 2, 3], 'IMG_0001.HEIC', 'image/heic'))).toBe(false);
    expect(await isIphonePhoto(file([], 'empty.heic'))).toBe(false);
  });
});

describe('toUploadableFile', () => {
  it('returns every other file exactly as it is', async () => {
    const jpeg = file([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0], 'ticket.jpg', 'image/jpeg');
    expect(await toUploadableFile(jpeg)).toBe(jpeg);
    const pdf = file([...'%PDF-1.7\n%%EOF\n\n\n\n\n'].map((c) => c.charCodeAt(0)), 'ticket.pdf', 'application/pdf');
    expect(await toUploadableFile(pdf)).toBe(pdf);
  });
});

describe('jpegName', () => {
  it('swaps the ending for .jpg', () => {
    expect(jpegName('IMG_4086.HEIC')).toBe('IMG_4086.jpg');
    expect(jpegName('holiday.photo.heif')).toBe('holiday.photo.jpg');
    expect(jpegName('no-ending')).toBe('no-ending.jpg');
    expect(jpegName('.heic')).toBe('photo.jpg');
  });
});

describe('what the file window offers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('offers iPhone photos on a computer', () => {
    expect(acceptWithIphonePhotos('.pdf,.jpg')).toBe('.pdf,.jpg,.heic,.heif,image/heic,image/heif');
    expect(dropzoneAcceptWithIphonePhotos({ 'image/png': ['.png'] })).toEqual({ 'image/png': ['.png'], 'image/heic': ['.heic'], 'image/heif': ['.heif'] });
  });

  it('does not ask for HEIC on an iPhone or iPad, so iOS keeps converting the photo itself', async () => {
    for (const device of [
      { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone', maxTouchPoints: 5 },
      { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }, // iPad
    ]) {
      vi.resetModules();
      vi.stubGlobal('navigator', device);
      const onIos = await import('./iphonePhotos');
      expect(onIos.isIOS).toBe(true);
      expect(onIos.acceptWithIphonePhotos('.pdf,.jpg')).toBe('.pdf,.jpg');
      expect(onIos.dropzoneAcceptWithIphonePhotos({ 'image/png': ['.png'] })).toEqual({ 'image/png': ['.png'] });
    }
  });

  it('treats a Mac without a touch screen as a computer', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 });
    const onMac = await import('./iphonePhotos');
    expect(onMac.isIOS).toBe(false);
  });
});
