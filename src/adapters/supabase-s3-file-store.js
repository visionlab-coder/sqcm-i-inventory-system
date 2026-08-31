const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function safeKey(value) {
  const key = required(value, 'Storage key');
  if (!/^[a-zA-Z0-9/_-]+\.(?:jpg|png|pdf)$/.test(key) || key.includes('..')) throw new Error('Storage key is invalid.');
  return key;
}

async function bodyBuffer(body) {
  if (!body) throw new Error('S3 object body is missing.');
  if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function createSupabaseS3FileStore(config, clientOverride = null) {
  const endpoint = required(config.storageS3Endpoint, 'STORAGE_S3_ENDPOINT');
  const region = required(config.storageS3Region, 'STORAGE_S3_REGION');
  const bucket = required(config.storageBucket, 'STORAGE_BUCKET');
  const accessKeyId = required(config.storageS3AccessKeyId, 'STORAGE_S3_ACCESS_KEY_ID');
  const secretAccessKey = required(config.storageS3SecretAccessKey, 'STORAGE_S3_SECRET_ACCESS_KEY');
  if (!/^https:\/\//i.test(endpoint)) throw new Error('Supabase S3 endpoint must use HTTPS.');
  const client = clientOverride || new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });

  return {
    driver: 'SUPABASE_S3',
    async write(storageKey, content) {
      const key = safeKey(storageKey);
      if (!Buffer.isBuffer(content) || content.length < 1) throw new Error('Storage content is required.');
      const contentType = key.endsWith('.jpg') ? 'image/jpeg' : key.endsWith('.png') ? 'image/png' : 'application/pdf';
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: contentType }));
    },
    async read(storageKey) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: safeKey(storageKey) }));
      return bodyBuffer(response.Body);
    },
    async removeNew(storageKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey(storageKey) }));
    },
    async healthCheck() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { status: 'ok', driver: 'SUPABASE_S3', bucket };
    }
  };
}

module.exports = { bodyBuffer, createSupabaseS3FileStore, safeKey };
