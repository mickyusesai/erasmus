import { describe, expect, it } from 'vitest';
import type { FileRejection } from 'react-dropzone';
import { rejectionMessage, uploadErrorMessage } from './uploadErrors';

const rejected = (name: string, code: string): FileRejection => ({
  file: new File(['x'], name),
  errors: [{ code, message: 'from the library' }],
});

describe('uploadErrorMessage', () => {
  it('passes on a real reason', () => {
    expect(uploadErrorMessage(new Error('This PDF is password-protected.'), 'Failed to upload')).toBe('This PDF is password-protected.');
  });

  it('falls back when there is no reason', () => {
    expect(uploadErrorMessage(new Error('An error occurred'), 'Failed to upload')).toBe('Failed to upload');
    expect(uploadErrorMessage(new Error('Failed to fetch'), 'Failed to upload')).toBe('Failed to upload');
    expect(uploadErrorMessage(new Error(''), 'Failed to upload')).toBe('Failed to upload');
    expect(uploadErrorMessage('boom', 'Failed to upload')).toBe('Failed to upload');
  });
});

describe('rejectionMessage', () => {
  it('says a file is too large', () => {
    expect(rejectionMessage([rejected('scan.pdf', 'file-too-large')])).toBe('"scan.pdf" is larger than 10 MB. Try a smaller photo, a screenshot or a compressed PDF.');
  });

  it('says a file type is not accepted, and what is', () => {
    expect(rejectionMessage([rejected('notes.docx', 'file-invalid-type')])).toBe(`"notes.docx" can't be uploaded here. Use a PDF, a photo or a screenshot.`);
    expect(rejectionMessage([rejected('clip.mov', 'file-invalid-type')], { allowed: 'a photo' })).toBe(`"clip.mov" can't be uploaded here. Use a photo.`);
  });

  it('counts the files when several are refused', () => {
    const message = rejectionMessage([rejected('a.docx', 'file-invalid-type'), rejected('b.docx', 'file-invalid-type')]);
    expect(message).toBe(`2 files could not be added. "a.docx" can't be uploaded here. Use a PDF, a photo or a screenshot.`);
  });

  it('asks for one file at a time where only one fits', () => {
    expect(rejectionMessage([rejected('a.pdf', 'too-many-files'), rejected('b.pdf', 'too-many-files')])).toBe('Please add one file at a time here.');
  });

  it('is empty when nothing was refused', () => {
    expect(rejectionMessage([])).toBe('');
  });
});
