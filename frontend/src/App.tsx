import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GoogleLogin, useGoogleLogin } from "@react-oauth/google";
import { AxiosError } from "axios";
import {
  Camera,
  CloudSun,
  Fish,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  Thermometer,
  UserCircle2,
  Wind
} from "lucide-react";
import { api, authHeader, setStoredToken } from "./api";

type AuthUser = {
  id: string;
  email: string;
  role: "MEMBER" | "ADMIN";
};

type SpeciesName = "Snoek" | "Baars" | "Karper" | "Snoekbaars";

type PhotoRecord = {
  id: string;
  sourceItemId: string;
  imageUrl: string;
  thumbnailUrl: string;
  takenAt: string;
  lat: number;
  lon: number;
  locationName: string;
  species: SpeciesName;
  weather: {
    pressureHpa: number;
    tempC: number;
    windKph: number;
  };
};

type DashboardResult = {
  species: string;
  count: number;
  averages: {
    pressureHpa: number | null;
    tempC: number | null;
    windKph: number | null;
  };
};

type PickerSessionResponse = {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
};

type PickerMediaItemsResponse = {
  mediaItems?: Array<{
    id: string;
    createTime?: string;
    mediaFile?: {
      baseUrl?: string;
      mimeType?: string;
      filename?: string;
    };
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
  nextPageToken?: string;
};

type ImportPayloadItem = {
  sourceItemId: string;
  imageUrl: string;
  thumbnailUrl: string;
  takenAt: string;
  lat: number;
  lon: number;
  locationName: string;
  species: SpeciesName;
};

const speciesOptions: SpeciesName[] = ["Snoek", "Baars", "Karper", "Snoekbaars"];
const defaultSpecies: SpeciesName = "Snoek";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const googleConfigured =
  googleClientId.length > 0 && googleClientId !== "replace_with_google_oauth_web_client_id";

function parseDurationToMs(value?: string) {
  if (!value) {
    return 3000;
  }
  const trimmed = value.trim();
  if (trimmed.endsWith("ms")) {
    return Number(trimmed.slice(0, -2));
  }
  if (trimmed.endsWith("s")) {
    return Number(trimmed.slice(0, -1)) * 1000;
  }
  if (trimmed.endsWith("m")) {
    return Number(trimmed.slice(0, -1)) * 60_000;
  }
  return 3000;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesName>(defaultSpecies);
  const [dashboard, setDashboard] = useState<DashboardResult | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [importing, setImporting] = useState(false);
  const pickerPopupRef = useRef<Window | null>(null);

  useEffect(() => {
    api
      .get<{ user: AuthUser }>("/auth/me", { headers: authHeader() })
      .then((result) => {
        setUser(result.data.user);
      })
      .catch(() => {
        setUser(null);
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setPhotos([]);
      setDashboard(null);
      return;
    }
    void fetchPhotos(selectedSpecies);
  }, [user, selectedSpecies]);

  const pickerLogin = useGoogleLogin({
    flow: "implicit",
    scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
    onSuccess: async (tokenResponse) => {
      try {
        await runPhotosPickerFlow(tokenResponse.access_token);
      } catch (error) {
        closePickerPopup();
        if (error instanceof Error && error.message === "POPUP_BLOCKED") {
          setError("Browser blokkeert de picker-popup. Sta pop-ups toe voor localhost en probeer opnieuw.");
        } else if (error instanceof Error && error.message === "Picker timeout") {
          setError("Picker niet afgerond. Selecteer fotos in het Google venster en klik op Gereed.");
        } else if (error instanceof Error && error.message === "NO_MEDIA_ITEMS") {
          setError("Google Picker gaf geen fotos terug. Controleer of je echt een foto selecteert en op Gereed klikt.");
        } else if (error instanceof Error && error.message === "NO_ITEMS_IMPORTED") {
          setError("Import afgerond, maar backend ontving 0 fotos.");
        } else {
          setError(getApiErrorMessage(error, "Google Photos Picker import mislukt."));
        }
      } finally {
        setImporting(false);
      }
    },
    onError: () => {
      closePickerPopup();
      setImporting(false);
      setError("Google Photos toestemming mislukt.");
    }
  });

  async function fetchPhotos(species?: SpeciesName) {
    setLoadingPhotos(true);
    setError(null);
    try {
      const response = await api.get<{ photos: PhotoRecord[] }>("/photos", {
        headers: authHeader(),
        params: species ? { species } : {}
      });
      setPhotos(response.data.photos);
      await fetchDashboard(species ?? selectedSpecies);
    } catch {
      setError("Fotos laden mislukt.");
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function fetchDashboard(species: SpeciesName) {
    try {
      const response = await api.get<DashboardResult>(`/dashboard/species/${species}`, {
        headers: authHeader()
      });
      setDashboard(response.data);
    } catch {
      setDashboard({
        species,
        count: 0,
        averages: { pressureHpa: null, tempC: null, windKph: null }
      });
    }
  }

  async function runPhotosPickerFlow(accessToken: string) {
    setInfo(null);
    const session = await api.post<PickerSessionResponse>(
      "/picker/sessions",
      { accessToken, maxItemCount: 50 },
      { headers: authHeader() }
    );

    let pickerWindow = pickerPopupRef.current;
    if (pickerWindow && !pickerWindow.closed) {
      pickerWindow.location.href = session.data.pickerUri;
    } else {
      pickerWindow = window.open(session.data.pickerUri, "_blank", "noopener,noreferrer");
      if (!pickerWindow) {
        throw new Error("POPUP_BLOCKED");
      }
    }
    pickerPopupRef.current = pickerWindow;
    pickerWindow.focus();

    const pollIntervalMs = Math.max(1000, parseDurationToMs(session.data.pollingConfig?.pollInterval));
    const timeoutMs = Math.min(120_000, Math.max(30_000, parseDurationToMs(session.data.pollingConfig?.timeoutIn)));
    const startedAt = Date.now();

    let mediaSet = session.data.mediaItemsSet;
    while (!mediaSet && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const status = await api.post<PickerSessionResponse>(
        `/picker/sessions/${session.data.id}`,
        { accessToken },
        { headers: authHeader() }
      );
      mediaSet = status.data.mediaItemsSet;
    }

    if (!mediaSet) {
      throw new Error("Picker timeout");
    }

    const importedItems: ImportPayloadItem[] = [];
    let nextPageToken: string | undefined;
    do {
      const mediaResponse = await api.post<PickerMediaItemsResponse>(
        `/picker/sessions/${session.data.id}/media-items`,
        { accessToken, pageToken: nextPageToken },
        { headers: authHeader() }
      );

      const mapped = (mediaResponse.data.mediaItems ?? [])
        .map((item): ImportPayloadItem | null => {
          const baseUrl = item.mediaFile?.baseUrl;
          if (!baseUrl) {
            return null;
          }
          return {
            sourceItemId: item.id,
            imageUrl: `${baseUrl}=w2000-h2000`,
            thumbnailUrl: `${baseUrl}=w600-h600`,
            takenAt: item.createTime ?? new Date().toISOString(),
            lat: item.location?.latitude ?? 52.1,
            lon: item.location?.longitude ?? 5.3,
            locationName:
              item.location?.latitude && item.location?.longitude
                ? `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`
                : "Onbekende locatie",
            species: defaultSpecies
          };
        })
        .filter((item): item is ImportPayloadItem => item !== null);

      importedItems.push(...mapped);
      nextPageToken = mediaResponse.data.nextPageToken;
    } while (nextPageToken);

    if (importedItems.length === 0) {
      throw new Error("NO_MEDIA_ITEMS");
    }

    const imported = await api.post<{ importedCount: number }>(
      "/photos/import-picker-selection",
      { items: importedItems },
      { headers: authHeader() }
    );
    if (imported.data.importedCount <= 0) {
      throw new Error("NO_ITEMS_IMPORTED");
    }

    await fetchPhotos(selectedSpecies);
    setInfo(`Import voltooid: ${imported.data.importedCount} foto(s) toegevoegd.`);
  }

  function closePickerPopup() {
    const popup = pickerPopupRef.current;
    pickerPopupRef.current = null;
    if (!popup || popup.closed) {
      return;
    }
    try {
      popup.close();
    } catch {
      // Ignore close errors from browser popup policies.
    }
  }

  async function handleGoogleLogin(idToken: string) {
    setError(null);
    setInfo(null);
    try {
      const response = await api.post<{ token: string; user: AuthUser }>("/auth/google/callback", {
        idToken
      });
      setStoredToken(response.data.token);
      setUser(response.data.user);
    } catch {
      try {
        const fallback = await api.post<{ token: string; user: AuthUser }>("/auth/dev-login", {});
        setStoredToken(fallback.data.token);
        setUser(fallback.data.user);
        setError("Google login is mislukt. Je bent automatisch ingelogd met Dev login (lokaal).");
      } catch {
        setError("Inloggen met Google is mislukt.");
      }
    }
  }

  async function handleDevLogin() {
    setError(null);
    setInfo(null);
    try {
      const response = await api.post<{ token: string; user: AuthUser }>("/auth/dev-login", {});
      setStoredToken(response.data.token);
      setUser(response.data.user);
    } catch {
      setError("Dev login mislukt. Zet DEV_AUTH_BYPASS=true in backend/.env.");
    }
  }

  async function updateSpecies(photoId: string, species: SpeciesName) {
    try {
      await api.post(
        `/photos/${photoId}/species`,
        { species },
        {
          headers: authHeader()
        }
      );
      await fetchPhotos(selectedSpecies);
    } catch {
      setError("Soort aanpassen mislukt.");
    }
  }

  function startPickerImport() {
    setInfo(null);
    if (!googleConfigured) {
      setError("Google Picker staat nog niet geconfigureerd. Zet eerst VITE_GOOGLE_CLIENT_ID.");
      return;
    }
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      setError("Browser blokkeert de picker-popup. Sta pop-ups toe voor localhost en probeer opnieuw.");
      return;
    }
    popup.document.title = "Google Picker";
    popup.document.body.innerHTML =
      "<p style='font-family: sans-serif; padding: 16px;'>Google Picker wordt geopend...</p>";
    pickerPopupRef.current = popup;
    setError(null);
    setImporting(true);
    pickerLogin();
  }

  function logout() {
    setStoredToken(null);
    setUser(null);
    setImporting(false);
    setInfo(null);
  }

  const photoCount = useMemo(() => photos.length, [photos]);

  return (
    <main className="min-h-screen bg-aurora px-4 py-6 sm:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-white/30 bg-white/80 p-5 shadow-xl backdrop-blur md:p-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <Fish className="h-4 w-4" />
              Visfoto Dashboard
            </div>
            <h1 className="text-3xl font-bold text-slate-900">VisApp</h1>
            <p className="text-slate-600">Google login, Photos Picker import en soortanalyse.</p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <UserCircle2 className="h-5 w-5 text-brand-600" />
            <div className="text-sm">
              <p className="font-semibold text-slate-800">{user?.email ?? "Niet ingelogd"}</p>
              <p className="text-slate-500">Rol: {user?.role ?? "GUEST"}</p>
            </div>
          </div>
        </div>

        {!user ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-slate-600">
              Login om fotos te importeren via Google Photos Picker en dashboards te zien.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {googleConfigured ? (
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    if (credentialResponse.credential) {
                      void handleGoogleLogin(credentialResponse.credential);
                    } else {
                      setError("Google gaf geen token terug.");
                    }
                  }}
                  onError={() => setError("Google login popup is afgebroken.")}
                />
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Google login uitgeschakeld: zet `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`.
                </div>
              )}
              <button
                onClick={() => void handleDevLogin()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
              >
                Dev login (lokaal)
              </button>
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {info ? <p className="mt-3 text-sm text-emerald-700">{info}</p> : null}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={<Gauge className="h-5 w-5 text-amber-700" />}
                title="Gem. luchtdruk"
                value={dashboard?.averages.pressureHpa !== null ? `${dashboard?.averages.pressureHpa} hPa` : "-"}
                tone="amber"
              />
              <MetricCard
                icon={<Thermometer className="h-5 w-5 text-rose-700" />}
                title="Gem. temperatuur"
                value={dashboard?.averages.tempC !== null ? `${dashboard?.averages.tempC} C` : "-"}
                tone="rose"
              />
              <MetricCard
                icon={<Wind className="h-5 w-5 text-sky-700" />}
                title="Gem. wind"
                value={dashboard?.averages.windKph !== null ? `${dashboard?.averages.windKph} km/u` : "-"}
                tone="sky"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Soorten</h2>
                <button
                  onClick={startPickerImport}
                  disabled={importing}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {importing ? (
                    <>
                      <LoaderCircle className="mr-1 inline-block h-4 w-4 animate-spin" />
                      Import bezig
                    </>
                  ) : (
                    <>
                      <Camera className="mr-1 inline-block h-4 w-4" />
                      Importeer fotos
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {speciesOptions.map((species) => {
                  const active = species === selectedSpecies;
                  return (
                    <button
                      key={species}
                      onClick={() => setSelectedSpecies(species)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-brand-700 text-white shadow"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {species}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <CloudSun className="h-5 w-5 text-brand-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Overzicht {selectedSpecies} ({photoCount} fotos)
                </h2>
              </div>

              {loadingPhotos ? (
                <p className="text-sm text-slate-500">Laden...</p>
              ) : photos.length === 0 ? (
                <p className="text-sm text-slate-500">Nog geen fotos voor deze soort. Importeer via de picker.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {photos.map((photo) => (
                    <article
                      key={photo.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <img src={photo.imageUrl} alt={photo.species} className="h-44 w-full object-cover" />
                      <div className="space-y-2 p-4 text-sm">
                        <p className="font-semibold text-slate-900">{photo.locationName}</p>
                        <p className="text-slate-600">
                          {new Date(photo.takenAt).toLocaleDateString("nl-NL")} om{" "}
                          {new Date(photo.takenAt).toLocaleTimeString("nl-NL", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                        <p className="text-slate-700">
                          {photo.weather.tempC} C | {photo.weather.pressureHpa} hPa | {photo.weather.windKph} km/u
                        </p>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Soort
                          </label>
                          <select
                            value={photo.species}
                            onChange={(event) =>
                              void updateSpecies(photo.id, event.target.value as SpeciesName)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            {speciesOptions.map((species) => (
                              <option key={species} value={species}>
                                {species}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" />
                Ingelogd als {user.role}
              </div>
              <button
                onClick={logout}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Uitloggen
              </button>
            </div>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {info ? <p className="mt-4 text-sm text-emerald-700">{info}</p> : null}
      </section>
    </main>
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const apiError = error.response?.data?.error;
    if (typeof apiError === "string" && apiError.trim().length > 0) {
      return apiError;
    }
    if (typeof error.message === "string" && error.message.trim().length > 0) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function MetricCard({
  icon,
  title,
  value,
  tone
}: {
  icon: ReactNode;
  title: string;
  value: string;
  tone: "amber" | "rose" | "sky";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : tone === "rose"
        ? "bg-rose-50 border-rose-200"
        : "bg-sky-50 border-sky-200";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-3 inline-flex rounded-lg bg-white p-2 shadow-sm">{icon}</div>
      <p className="text-sm text-slate-600">{title}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
