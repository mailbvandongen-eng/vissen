declare module "exif-parser" {
  interface ExifTags {
    DateTimeOriginal?: number;
    CreateDate?: number;
    GPSLatitude?: number;
    GPSLongitude?: number;
    Make?: string;
    Model?: string;
    [key: string]: unknown;
  }

  interface ExifResult {
    tags: ExifTags;
  }

  interface ExifParser {
    parse(): ExifResult;
  }

  function create(buffer: Buffer): ExifParser;

  export = { create };
}
