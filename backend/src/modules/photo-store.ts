import { prisma } from "../lib/prisma.js";
import { randomUUID } from "node:crypto";
import { downloadAndProcessImage, processUploadedImage } from "./image-processor.js";
import { fetchHistoricalWeather } from "./weather-api.js";

export type SpeciesName = "Snoek" | "Baars" | "Karper" | "Snoekbaars";

export type PhotoRecord = {
  id: string;
  userId: string;
  userEmail: string;
  sourceItemId: string;
  imageUrl: string;
  thumbnailUrl: string;
  takenAt: string;
  lat: number;
  lon: number;
  locationName: string;
  species: SpeciesName;
  weather: {
    pressureHpa: number | null;
    tempC: number | null;
    windKph: number | null;
  };
};

export type PickerSelectionInput = {
  sourceItemId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  takenAt: string;
  lat: number;
  lon: number;
  locationName?: string;
  species?: SpeciesName;
};

export type UploadPhotoInput = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  takenAt?: string;
  lat?: number;
  lon?: number;
  locationName?: string;
  species?: SpeciesName;
};

// Ensure species exist in database
async function ensureSpecies() {
  const speciesList: SpeciesName[] = ["Snoek", "Baars", "Karper", "Snoekbaars"];
  for (const name of speciesList) {
    await prisma.species.upsert({
      where: { slug: name.toLowerCase() },
      update: {},
      create: {
        slug: name.toLowerCase(),
        displayName: name,
      },
    });
  }
}

// Initialize species on first import
let speciesInitialized = false;

export async function importPickerSelection(
  userId: string,
  userEmail: string,
  items: PickerSelectionInput[],
  accessToken: string
): Promise<PhotoRecord[]> {
  if (!speciesInitialized) {
    await ensureSpecies();
    speciesInitialized = true;
  }

  const imported: PhotoRecord[] = [];

  for (const item of items) {
    // Check if already imported (by sourceItemId)
    const existing = await prisma.photo.findUnique({
      where: { sourceItemId: item.sourceItemId },
      include: {
        user: true,
        weatherData: true,
        speciesLinks: { include: { species: true } },
      },
    });

    if (existing) {
      imported.push(mapToPhotoRecord(existing));
      continue;
    }

    try {
      // Download, process and upload image to Supabase
      const processed = await downloadAndProcessImage(item.imageUrl, item.sourceItemId, accessToken);

      // Use EXIF data if available, fallback to Google's data
      const takenAt = processed.exif.takenAt ?? new Date(item.takenAt);
      const lat = processed.exif.lat ?? item.lat;
      const lon = processed.exif.lon ?? item.lon;

      // Fetch historical weather
      const weather = await fetchHistoricalWeather(lat, lon, takenAt);

      // Get species
      const speciesName = item.species ?? "Snoek";
      const species = await prisma.species.findUnique({
        where: { slug: speciesName.toLowerCase() },
      });

      // Create photo with weather data
      const photo = await prisma.photo.create({
        data: {
          userId,
          sourceItemId: item.sourceItemId,
          imageUrl: processed.imageUrl,
          thumbnailUrl: processed.thumbnailUrl,
          takenAt,
          lat,
          lon,
          weatherData: {
            create: {
              temperatureC: weather.tempC,
              pressureHpa: weather.pressureHpa,
              windKph: weather.windKph,
              precipitation: weather.precipitation,
              weatherCode: weather.weatherCode,
            },
          },
          speciesLinks: species
            ? {
                create: {
                  speciesId: species.id,
                  manualOverride: true,
                },
              }
            : undefined,
        },
        include: {
          user: true,
          weatherData: true,
          speciesLinks: { include: { species: true } },
        },
      });

      imported.push(mapToPhotoRecord(photo));
    } catch (error) {
      console.error(`Failed to import photo ${item.sourceItemId}:`, error);
      // Continue with other photos
    }
  }

  return imported;
}

export async function importUploadedPhoto(
  userId: string,
  userEmail: string,
  input: UploadPhotoInput
): Promise<PhotoRecord> {
  if (!speciesInitialized) {
    await ensureSpecies();
    speciesInitialized = true;
  }

  if (!input.mimeType.startsWith("image/")) {
    throw new Error("Alleen afbeeldingsbestanden zijn toegestaan.");
  }

  const match = input.dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("Ongeldig afbeeldingsformaat ontvangen.");
  }

  const [, mimeType, base64Data] = match;
  if (!mimeType.startsWith("image/")) {
    throw new Error("Alleen afbeeldingsbestanden zijn toegestaan.");
  }

  const sourceItemId = `upload-${randomUUID()}`;
  const buffer = Buffer.from(base64Data, "base64");
  const processed = await processUploadedImage(buffer, sourceItemId);

  const takenAt = processed.exif.takenAt ?? (input.takenAt ? new Date(input.takenAt) : new Date());
  const lat = processed.exif.lat ?? input.lat ?? 52.1;
  const lon = processed.exif.lon ?? input.lon ?? 5.3;
  const weather = await fetchHistoricalWeather(lat, lon, takenAt);

  const speciesName = input.species ?? "Snoek";
  const species = await prisma.species.findUnique({
    where: { slug: speciesName.toLowerCase() },
  });

  const photo = await prisma.photo.create({
    data: {
      userId,
      sourceItemId,
      imageUrl: processed.imageUrl,
      thumbnailUrl: processed.thumbnailUrl,
      takenAt,
      lat,
      lon,
      weatherData: {
        create: {
          temperatureC: weather.tempC,
          pressureHpa: weather.pressureHpa,
          windKph: weather.windKph,
          precipitation: weather.precipitation,
          weatherCode: weather.weatherCode,
        },
      },
      speciesLinks: species
        ? {
            create: {
              speciesId: species.id,
              manualOverride: true,
            },
          }
        : undefined,
    },
    include: {
      user: true,
      weatherData: true,
      speciesLinks: { include: { species: true } },
    },
  });

  void userEmail;
  void input.fileName;
  void input.locationName;

  return mapToPhotoRecord(photo);
}

// List ALL photos (not filtered by user - everyone sees everything)
export async function listPhotos(species?: string): Promise<PhotoRecord[]> {
  const photos = await prisma.photo.findMany({
    where: species
      ? {
          speciesLinks: {
            some: {
              species: {
                slug: species.toLowerCase(),
              },
            },
          },
        }
      : undefined,
    include: {
      user: true,
      weatherData: true,
      speciesLinks: { include: { species: true } },
    },
    orderBy: { takenAt: "desc" },
  });

  return photos.map(mapToPhotoRecord);
}

export async function updatePhotoSpecies(
  photoId: string,
  speciesName: SpeciesName
): Promise<PhotoRecord | null> {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    return null;
  }

  const species = await prisma.species.findUnique({
    where: { slug: speciesName.toLowerCase() },
  });

  if (!species) {
    return null;
  }

  // Delete old species links and create new one
  await prisma.photoSpecies.deleteMany({
    where: { photoId },
  });

  await prisma.photoSpecies.create({
    data: {
      photoId,
      speciesId: species.id,
      manualOverride: true,
    },
  });

  const updated = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      user: true,
      weatherData: true,
      speciesLinks: { include: { species: true } },
    },
  });

  return updated ? mapToPhotoRecord(updated) : null;
}

// Dashboard for ALL users combined
export async function speciesDashboard(speciesName: string) {
  const photos = await listPhotos(speciesName);

  if (photos.length === 0) {
    return {
      species: speciesName,
      count: 0,
      averages: {
        pressureHpa: null,
        tempC: null,
        windKph: null,
      },
    };
  }

  const withWeather = photos.filter(
    (p) => p.weather.pressureHpa !== null || p.weather.tempC !== null
  );

  if (withWeather.length === 0) {
    return {
      species: speciesName,
      count: photos.length,
      averages: {
        pressureHpa: null,
        tempC: null,
        windKph: null,
      },
    };
  }

  const avgPressure =
    withWeather.reduce((sum, p) => sum + (p.weather.pressureHpa ?? 0), 0) /
    withWeather.filter((p) => p.weather.pressureHpa !== null).length;

  const avgTemp =
    withWeather.reduce((sum, p) => sum + (p.weather.tempC ?? 0), 0) /
    withWeather.filter((p) => p.weather.tempC !== null).length;

  const avgWind =
    withWeather.reduce((sum, p) => sum + (p.weather.windKph ?? 0), 0) /
    withWeather.filter((p) => p.weather.windKph !== null).length;

  return {
    species: speciesName,
    count: photos.length,
    averages: {
      pressureHpa: isNaN(avgPressure) ? null : Number(avgPressure.toFixed(1)),
      tempC: isNaN(avgTemp) ? null : Number(avgTemp.toFixed(1)),
      windKph: isNaN(avgWind) ? null : Number(avgWind.toFixed(1)),
    },
  };
}

// Helper to map Prisma result to PhotoRecord
function mapToPhotoRecord(photo: any): PhotoRecord {
  const species = photo.speciesLinks?.[0]?.species;

  return {
    id: photo.id,
    userId: photo.userId,
    userEmail: photo.user?.email ?? "unknown",
    sourceItemId: photo.sourceItemId ?? "",
    imageUrl: photo.imageUrl,
    thumbnailUrl: photo.thumbnailUrl ?? photo.imageUrl,
    takenAt: photo.takenAt?.toISOString() ?? new Date().toISOString(),
    lat: photo.lat ?? 52.1,
    lon: photo.lon ?? 5.3,
    locationName:
      photo.lat && photo.lon
        ? `${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}`
        : "Onbekende locatie",
    species: (species?.displayName as SpeciesName) ?? "Snoek",
    weather: {
      pressureHpa: photo.weatherData?.pressureHpa ?? null,
      tempC: photo.weatherData?.temperatureC ?? null,
      windKph: photo.weatherData?.windKph ?? null,
    },
  };
}
