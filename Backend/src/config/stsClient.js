import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client } from "@aws-sdk/client-s3";

const stsClient = new STSClient({
  region: process.env.AWS_REGION || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function getTemporaryS3Client(sessionName = "securedrive") {
  const roleArn = process.env.AWS_ROLE_ARN;

  if (!roleArn) {
    const { s3Client } = await import("./s3Client.js");
    return s3Client;
  }

  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: String(sessionName).slice(0, 64),
    DurationSeconds: 900,
  });

  const response = await stsClient.send(command);
  const creds = response.Credentials;

  return new S3Client({
    region: process.env.AWS_REGION || "eu-west-2",
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });
}