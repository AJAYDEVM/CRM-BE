import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface StoredFile {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  s3Bucket: string;
  url: string;
}

@Injectable()
export class FileStorageService {
  constructor(private config: ConfigService) {}

  /**
   * S3-compatible storage structure.
   * In production, replace with AWS SDK PutObject/GetObject.
   */
  async upload(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    folder: string;
  }): Promise<StoredFile> {
    const bucket = this.config.get<string>('S3_BUCKET', 'tmci-operations');
    const ext = path.extname(params.originalName);
    const fileName = `${uuidv4()}${ext}`;
    const s3Key = `${params.folder}/${new Date().getFullYear()}/${fileName}`;
    const endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    const url = `${endpoint}/${bucket}/${s3Key}`;

    return {
      fileName,
      originalName: params.originalName,
      mimeType: params.mimeType,
      size: params.buffer.length,
      s3Key,
      s3Bucket: bucket,
      url,
    };
  }
}
