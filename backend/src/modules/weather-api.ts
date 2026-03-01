// Open-Meteo Historical Weather API (free, no API key needed)
// https://open-meteo.com/en/docs/historical-weather-api

type OpenMeteoResponse = {
  hourly?: {
    time: string[];
    temperature_2m?: number[];
    surface_pressure?: number[];
    windspeed_10m?: number[];
    precipitation?: number[];
    weathercode?: number[];
  };
};

export type WeatherResult = {
  tempC: number | null;
  pressureHpa: number | null;
  windKph: number | null;
  precipitation: number | null;
  weatherCode: number | null;
};

export async function fetchHistoricalWeather(
  lat: number,
  lon: number,
  date: Date
): Promise<WeatherResult> {
  try {
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const hour = date.getHours();

    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lon.toFixed(4));
    url.searchParams.set("start_date", dateStr);
    url.searchParams.set("end_date", dateStr);
    url.searchParams.set(
      "hourly",
      "temperature_2m,surface_pressure,windspeed_10m,precipitation,weathercode"
    );
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(`Weather API returned ${response.status}`);
      return nullResult();
    }

    const data = (await response.json()) as OpenMeteoResponse;

    if (!data.hourly || !data.hourly.time) {
      return nullResult();
    }

    // Find closest hour
    const hourIndex = Math.min(hour, data.hourly.time.length - 1);

    return {
      tempC: data.hourly.temperature_2m?.[hourIndex] ?? null,
      pressureHpa: data.hourly.surface_pressure?.[hourIndex] ?? null,
      windKph: data.hourly.windspeed_10m?.[hourIndex] ?? null,
      precipitation: data.hourly.precipitation?.[hourIndex] ?? null,
      weatherCode: data.hourly.weathercode?.[hourIndex] ?? null,
    };
  } catch (error) {
    console.warn("Failed to fetch weather:", error);
    return nullResult();
  }
}

function nullResult(): WeatherResult {
  return {
    tempC: null,
    pressureHpa: null,
    windKph: null,
    precipitation: null,
    weatherCode: null,
  };
}
