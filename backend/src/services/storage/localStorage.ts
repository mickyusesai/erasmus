import fs from 'fs/promises';
import path from 'path';
import { StorageService, StorageFile, StoredFile } from './types.js';

/**
 * Local filesystem storage implementation
 * Used for development and single-server deployments
 */
export class LocalStorageService implements StorageService {
  private basePath: string;
  private baseUrl: string;

  constructor(basePath?: string, baseUrl?: string) {
    this.basePath = basePath || process.env.STORAGE_LOCAL_PATH || './uploads';
    this.baseUrl = baseUrl || '/uploads';
  }

  async store(file: StorageFile, destinationPath: string): Promise<StoredFile> {
    const fullPath = path.join(this.basePath, destinationPath);
    const directory = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, file.buffer);

    return {
      path: destinationPath,
      url: `${this.baseUrl}/${destinationPath}`,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async retrieve(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.readFile(fullPath);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(filePath: string): Promise<string> {
    return `${this.baseUrl}/${filePath}`;
  }

  async deleteDirectory(directoryPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, directoryPath);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
