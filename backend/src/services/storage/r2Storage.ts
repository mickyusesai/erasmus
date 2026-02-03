import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService, StorageFile, StoredFile } from './types.js';

/**
 * Cloudflare R2 storage implementation
 * R2 is S3-compatible, so we use the AWS SDK with a custom endpoint
 *
 * Required environment variables:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 access key ID
 * - R2_SECRET_ACCESS_KEY: R2 secret access key
 * - R2_BUCKET_NAME: R2 bucket name
 * - R2_JURISDICTION: (optional) "eu" for EU buckets, empty for default
 * - R2_PUBLIC_URL: (optional) Custom domain or public bucket URL for public files
 */
export class R2StorageService implements StorageService {
  private client: S3Client;
  private bucketName: string;
  private publicUrl?: string;
  private signedUrlExpiresIn: number;

  constructor(options?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    jurisdiction?: string;
    publicUrl?: string;
    signedUrlExpiresIn?: number;
  }) {
    const accountId = options?.accountId || process.env.R2_ACCOUNT_ID;
    const accessKeyId = options?.accessKeyId || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = options?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
    const jurisdiction = options?.jurisdiction || process.env.R2_JURISDICTION;
    this.bucketName = options?.bucketName || process.env.R2_BUCKET_NAME || '';
    this.publicUrl = options?.publicUrl || process.env.R2_PUBLIC_URL;
    this.signedUrlExpiresIn = options?.signedUrlExpiresIn || 3600; // 1 hour default

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      throw new Error(
        'R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME environment variables'
      );
    }

    // Build endpoint URL - EU jurisdiction requires different subdomain
    const jurisdictionPrefix = jurisdiction ? `${jurisdiction}.` : '';
    const endpoint = `https://${accountId}.${jurisdictionPrefix}r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async store(file: StorageFile, destinationPath: string): Promise<StoredFile> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: destinationPath,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalname: encodeURIComponent(file.originalname),
      },
    });

    await this.client.send(command);

    return {
      path: destinationPath,
      url: await this.getUrl(destinationPath),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async retrieve(path: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${path}`);
    }

    // Convert the readable stream to a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(path: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    await this.client.send(command);
  }

  async exists(path: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      // R2/S3 returns 404 NotFound when object doesn't exist
      if ((error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getUrl(path: string): Promise<string> {
    // If a public URL is configured (custom domain or public bucket), use that
    if (this.publicUrl) {
      return `${this.publicUrl}/${path}`;
    }

    // Otherwise, generate a signed URL for temporary access
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: this.signedUrlExpiresIn,
    });
  }

  async deleteDirectory(directoryPath: string): Promise<void> {
    // Ensure the path ends with a slash for directory listing
    const prefix = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`;

    // List all objects with the directory prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const listResponse = await this.client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return; // No files to delete
    }

    // Delete all objects in the directory
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
        Quiet: true,
      },
    });

    await this.client.send(deleteCommand);

    // If there are more objects (pagination), recursively delete
    if (listResponse.IsTruncated) {
      await this.deleteDirectory(directoryPath);
    }
  }
}
