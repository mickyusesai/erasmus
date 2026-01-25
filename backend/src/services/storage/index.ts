import { StorageService } from './types.js';
import { LocalStorageService } from './localStorage.js';

export * from './types.js';
export { LocalStorageService } from './localStorage.js';

/**
 * Factory function to create storage service based on environment configuration
 *
 * To add S3 support later:
 * 1. Create S3StorageService implementing StorageService
 * 2. Add 's3' case here
 * 3. Configure with AWS credentials from environment
 */
export function createStorageService(): StorageService {
  const storageType = process.env.STORAGE_TYPE || 'local';

  switch (storageType) {
    case 'local':
      return new LocalStorageService();

    // Future implementations:
    // case 's3':
    //   return new S3StorageService({
    //     bucket: process.env.AWS_S3_BUCKET!,
    //     region: process.env.AWS_REGION!,
    //   });

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
