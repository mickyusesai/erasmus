import { StorageService } from './types.js';
import { LocalStorageService } from './localStorage.js';
import { R2StorageService } from './r2Storage.js';

export * from './types.js';
export { LocalStorageService } from './localStorage.js';
export { R2StorageService } from './r2Storage.js';

/**
 * Factory function to create storage service based on environment configuration
 *
 * Supported storage types:
 * - 'local': Local filesystem storage (default, for development)
 * - 'r2': Cloudflare R2 storage (recommended for production)
 *
 * Environment variables for R2:
 * - STORAGE_TYPE=r2
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 access key ID
 * - R2_SECRET_ACCESS_KEY: R2 secret access key
 * - R2_BUCKET_NAME: R2 bucket name
 * - R2_PUBLIC_URL: (optional) Custom domain for public file access
 */
export function createStorageService(): StorageService {
  const storageType = process.env.STORAGE_TYPE || 'local';

  switch (storageType) {
    case 'local':
      return new LocalStorageService();

    case 'r2':
      return new R2StorageService();

    default:
      console.warn(`Unknown storage type: ${storageType}, falling back to local`);
      return new LocalStorageService();
  }
}

// Singleton instance
let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageInstance) {
    storageInstance = createStorageService();
  }
  return storageInstance;
}
