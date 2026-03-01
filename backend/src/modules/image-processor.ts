import sharp from "sharp";
import ExifParser from "exif-parser";
import crypto from "crypto";
import { uploadPhoto } from "../lib/supabase.js";

export type ExifResult = {
  takenAt: Date | null;
  lat: number | null;
  lon: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
};

export type ProcessedImage = {
  imageUrl: string;
  thumbnailUrl: string;
  exif: ExifResult;
};

async function processAndUploadBuffer(
  buffer: Buffer,
  sourceItemId: string
): Promise<ProcessedImage> {
  const hash = crypto.createHash("md5").update(sourceItemId).digest("hex").slice(0, 12);
  const filename = `${hash}.jpg`;
  const thumbnailFilename = `${hash}_thumb.jpg`;

  // Extract EXIF before processing (sharp can strip it)
  const exif = extractExif(buffer);
  console.log(`EXIF extracted:`, exif);

  // Process main image (max 1200px, quality 80)
  const mainBuffer = await sharp(buffer)
    .rotate()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  // Create thumbnail (300px)
  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize(300, 300, { fit: "cover" })
    .jpeg({ quality: 70 })
    .toBuffer();

  console.log(`Uploading to Supabase: ${filename}`);
  const mainUrl = await uploadPhoto(mainBuffer, filename);
  const thumbUrl = await uploadPhoto(thumbBuffer, thumbnailFilename);

  console.log(`Uploaded: ${mainUrl}`);

  return {
    imageUrl: mainUrl,
    thumbnailUrl: thumbUrl,
    exif,
  };
}

function extractExif(buffer: Buffer): ExifResult {
  try {
    const parser = ExifParser.create(buffer);
    const result = parser.parse();

    const tags = result.tags;
    let takenAt: Date | null = null;

    if (tags.DateTimeOriginal) {
      takenAt = new Date(tags.DateTimeOriginal * 1000);
    } else if (tags.CreateDate) {
      takenAt = new Date(tags.CreateDate * 1000);
    }

    return {
      takenAt,
      lat: tags.GPSLatitude ?? null,
      lon: tags.GPSLongitude ?? null,
      cameraMake: tags.Make ?? null,
      cameraModel: tags.Model ?? null,
    };
  } catch (err) {
    console.warn("EXIF extraction failed:", err);
    return {
      takenAt: null,
      lat: null,
      lon: null,
      cameraMake: null,
      cameraModel: null,
    };
  }
}

export async function downloadAndProcessImage(
  imageUrl: string,
  sourceItemId: string,
  accessToken: string
): Promise<ProcessedImage> {
  // Download image from Google Photos
  // Google Photos baseUrl requires suffix: =d for download, =w{width}-h{height} for specific size
  let downloadUrl = imageUrl;
  if (imageUrl.includes("googleusercontent.com") && !imageUrl.includes("=")) {
    downloadUrl = `${imageUrl}=d`; // =d downloads the original
  }

  console.log(`Downloading image: ${downloadUrl.slice(0, 80)}...`);
  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return processAndUploadBuffer(buffer, sourceItemId);
}

export async function processUploadedImage(
  buffer: Buffer,
  sourceItemId: string
): Promise<ProcessedImage> {
  return processAndUploadBuffer(buffer, sourceItemId);
}
