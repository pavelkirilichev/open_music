import { S3Client } from '@aws-sdk/client-s3';

export const BUCKET = process.env.MINIO_BUCKET ?? 'open-music-cache';

export const s3Client = new S3Client({
  endpoint: `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}`,
  region: 'us-east-1', // MinIO ignores region but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin_secret',
  },
  forcePathStyle: true, // required for MinIO
});
