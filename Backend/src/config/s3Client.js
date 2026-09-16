import { S3Client } from "@aws-sdk/client-s3";

// This file is the ONLY place the AWS SDK gets instantiated.
// The credentials below come from process.env — they are read on the server,
// at runtime, and are NEVER sent to the browser in any form.
export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET;
