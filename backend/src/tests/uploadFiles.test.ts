import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { unsupportedFileMessage } from '../utils/uploadFiles.js';
import { errorHandler, uploadLimitMessage, ValidationError } from '../middleware/errorHandler.js';

function respond(err: Error) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  errorHandler(err, {} as Request, res as unknown as Response, () => {});
  log.mockRestore();
  return { status: res.status.mock.calls[0][0] as number, message: res.json.mock.calls[0][0].error.message as string };
}

describe('unsupportedFileMessage', () => {
  it('names the file and what can be uploaded instead', () => {
    expect(unsupportedFileMessage({ originalname: 'notes.docx', mimetype: 'application/msword' }, 'a PDF, JPG, PNG or WebP file')).toBe(
      `"notes.docx" can't be uploaded here. Use a PDF, JPG, PNG or WebP file.`
    );
  });

  it('explains an iPhone photo that arrived unconverted (an old copy of the page)', () => {
    for (const file of [
      { originalname: 'IMG_4086.HEIC', mimetype: 'application/octet-stream' },
      { originalname: 'photo', mimetype: 'image/heic' },
      { originalname: 'photo.heif', mimetype: '' },
    ]) {
      expect(unsupportedFileMessage(file, 'a PDF')).toContain('iPhone photo (HEIC) that was not converted. Refresh this page');
    }
  });
});

describe('a refused upload answers with the reason', () => {
  it('a file over the size limit is a 400 that says so, not a server error', () => {
    const tooLarge = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
    expect(respond(tooLarge)).toEqual({ status: 400, message: uploadLimitMessage('LIMIT_FILE_SIZE') });
    expect(uploadLimitMessage('LIMIT_FILE_SIZE')).toContain('larger than 10 MB');
  });

  it('too many files and unknown limits get a message too', () => {
    expect(uploadLimitMessage('LIMIT_FILE_COUNT')).toContain('Too many files');
    expect(uploadLimitMessage('LIMIT_UNEXPECTED_FILE')).toContain('Too many files');
    expect(uploadLimitMessage(undefined)).toContain('could not be uploaded');
  });

  it('a refused file type is a 400 with its message', () => {
    expect(respond(new ValidationError(unsupportedFileMessage({ originalname: 'a.docx' }, 'a PDF')))).toEqual({
      status: 400,
      message: `"a.docx" can't be uploaded here. Use a PDF.`,
    });
  });
});
