import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Initialisation du client S3 avec les identifiants
const s3Client = new S3Client({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadFileToS3 = async (file) => {
  const fileName = `${Date.now()}_${file.name}`;

  const params = {
    Bucket: import.meta.env.VITE_AWS_BUCKET_NAME,
    Key: fileName,
    Body: file,
    ContentType: file.type,
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    return { success: true, fileName };
  } catch (error) {
    console.error("Erreur lors de l'envoi S3 :", error);
    return { success: false, error };
  }
};