/**
 * Storage service interface
 * Abstraction layer for file storage that can be implemented for different backends
 * (local filesystem, S3, Azure Blob Storage, etc.)
 */

export interface StorageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StoredFile {
  path: string;
  url: string;
  size: number;
  mimetype: string;
}

export interface StorageService {
  /**
   * Store a file and return its storage path/URL
   */
  store(file: StorageFile, destinationPath: string): Promise<StoredFile>;

  /**
   * Retrieve a file's contents
   */
  retrieve(path: string): Promise<Buffer>;

  /**
   * Delete a file
   */
  delete(path: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get a public URL for a file (may be temporary/signed for cloud storage)
   */
  getUrl(path: string): Promise<string>;

  /**
   * Delete all files in a directory (for cleanup)
   */
  deleteDirectory(directoryPath: string): Promise<void>;
}
