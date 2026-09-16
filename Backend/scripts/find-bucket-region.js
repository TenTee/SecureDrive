import "dotenv/config";
import { S3Client, GetBucketLocationCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "us-east-1", // GetBucketLocation marche toujours depuis us-east-1
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.AWS_S3_BUCKET;

console.log("Bucket name from .env:", bucket);
console.log("Access Key present:", !!process.env.AWS_ACCESS_KEY_ID);
console.log("Secret Key present:", !!process.env.AWS_SECRET_ACCESS_KEY);

try {
  const res = await client.send(
    new GetBucketLocationCommand({ Bucket: bucket })
  );

  // AWS renvoie null pour us-east-1, sinon le code région
  const region = res.LocationConstraint || "us-east-1";
  console.log("\n✅ Vraie région du bucket:", region);
} catch (err) {
  console.error("\n❌ Erreur:", err.message);
}