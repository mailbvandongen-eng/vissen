import { ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GoogleLogin, useGoogleLogin } from "@react-oauth/google";
import { AxiosError } from "axios";
import {
  Camera,
  CloudSun,
  Fish,
  Gauge,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Thermometer,
  Wind
} from "lucide-react";
import { api, authHeader, setStoredToken } from "./api";

type AuthUser = {
  id: string;
  email: string;
  role: "MEMBER" | "ADMIN";
  name?: string | null;
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
  userEmail: string;
  weather: {
    pressureHpa: number | null;
    tempC: number | null;
    windKph: number | null;
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

type PendingPhoto = {
  file: File;
  source: "camera" | "upload";
  previewUrl: string;
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

function toAutoClosePickerUri(uri: string) {
  const trimmed = uri.trim();
  if (trimmed.endsWith("/autoclose")) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, "")}/autoclose`;
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
  const [savingUpload, setSavingUpload] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    return () => {
      if (pendingPhoto) {
        URL.revokeObjectURL(pendingPhoto.previewUrl);
      }
    };
  }, [pendingPhoto]);

  const pickerLogin = useGoogleLogin({
    flow: "implicit",
    scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
    onSuccess: async (tokenResponse) => {
      try {
        await runPhotosPickerFlow(tokenResponse.access_token);
      } catch (currentError) {
        closePickerPopup();
        if (currentError instanceof Error && currentError.message === "POPUP_BLOCKED") {
          setError("Browser blokkeert de Google Foto's-popup. Sta pop-ups toe en probeer opnieuw.");
        } else if (currentError instanceof Error && currentError.message === "Picker timeout") {
          setError("De picker is niet afgerond. Selecteer een of meer foto's en klik op Gereed.");
        } else if (currentError instanceof Error && currentError.message === "NO_MEDIA_ITEMS") {
          setError("Google Foto's gaf geen foto's terug. Kies echt een foto en probeer opnieuw.");
        } else if (currentError instanceof Error && currentError.message === "NO_ITEMS_IMPORTED") {
          setError("Google Foto's gaf wel selectie terug, maar er is niets opgeslagen.");
        } else {
          setError(getApiErrorMessage(currentError, "Google Foto's import mislukt."));
        }
      } finally {
        closePickerPopup();
        setImporting(false);
      }
    },
    onError: () => {
      closePickerPopup();
      setImporting(false);
      setError("Toestemming voor Google Foto's is afgebroken.");
    }
  });

  const photoCount = useMemo(() => photos.length, [photos]);

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
    } catch (currentError) {
      setError(getApiErrorMessage(currentError, "Foto's laden mislukt."));
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
    const pickerUri = toAutoClosePickerUri(session.data.pickerUri);

    let pickerWindow = pickerPopupRef.current;
    if (pickerWindow && !pickerWindow.closed) {
      pickerWindow.location.href = pickerUri;
    } else {
      pickerWindow = window.open(pickerUri, "_blank", "popup=yes,width=520,height=740");
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
            species: selectedSpecies
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
      { accessToken, items: importedItems },
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
      // Ignore browser popup policy close issues.
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
      setInfo("Je bent ingelogd.");
    } catch {
      try {
        const fallback = await api.post<{ token: string; user: AuthUser }>("/auth/dev-login", {});
        setStoredToken(fallback.data.token);
        setUser(fallback.data.user);
        setInfo("Google login faalde, daarom is de lokale dev-login gebruikt.");
      } catch (currentError) {
        setError(getApiErrorMessage(currentError, "Inloggen mislukt."));
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
      setInfo("Je bent ingelogd.");
    } catch (currentError) {
      setError(getApiErrorMessage(currentError, "Dev-login mislukt. Zet DEV_AUTH_BYPASS=true in backend/.env."));
    }
  }

  async function updateSpecies(photoId: string, species: SpeciesName) {
    setError(null);
    try {
      await api.post(
        `/photos/${photoId}/species`,
        { species },
        {
          headers: authHeader()
        }
      );
      await fetchPhotos(selectedSpecies);
    } catch (currentError) {
      setError(getApiErrorMessage(currentError, "Soort aanpassen mislukt."));
    }
  }

  function startPickerImport() {
    setInfo(null);
    if (!googleConfigured) {
      setError("Google Foto's staat nog niet geconfigureerd. Zet VITE_GOOGLE_CLIENT_ID in frontend/.env.");
      return;
    }
    setError(null);
    setImporting(true);
    pickerLogin();
  }

  function openCameraCapture() {
    setError(null);
    cameraInputRef.current?.click();
  }

  function openUploadPicker() {
    setError(null);
    uploadInputRef.current?.click();
  }

  function handleFileSelected(source: "camera" | "upload", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (pendingPhoto) {
      URL.revokeObjectURL(pendingPhoto.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ file, source, previewUrl });
    setInfo(source === "camera" ? "Foto gekozen. Controleer de preview en sla daarna op." : "Bestand gekozen. Controleer de preview en sla daarna op.");
    event.target.value = "";
  }

  async function savePendingPhoto() {
    if (!pendingPhoto) {
      setError("Kies eerst een foto.");
      return;
    }

    setSavingUpload(true);
    setError(null);
    setInfo(null);

    try {
      const dataUrl = await fileToDataUrl(pendingPhoto.file);
      await api.post(
        "/photos/upload",
        {
          fileName: pendingPhoto.file.name,
          mimeType: pendingPhoto.file.type || "image/jpeg",
          dataUrl,
          species: selectedSpecies
        },
        { headers: authHeader() }
      );

      URL.revokeObjectURL(pendingPhoto.previewUrl);
      setPendingPhoto(null);
      await fetchPhotos(selectedSpecies);
      setInfo("Foto opgeslagen en toegevoegd aan je overzicht.");
    } catch (currentError) {
      setError(getApiErrorMessage(currentError, "Foto opslaan mislukt."));
    } finally {
      setSavingUpload(false);
    }
  }

  function clearPendingPhoto() {
    if (!pendingPhoto) {
      return;
    }
    URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
    setInfo(null);
  }

  function logout() {
    closePickerPopup();
    clearPendingPhoto();
    setStoredToken(null);
    setUser(null);
    setImporting(false);
    setInfo(null);
    setError(null);
  }

  return (
    <main className="min-h-screen bg-aurora px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl rounded-[2rem] border border-white/40 bg-white/80 p-4 shadow-[0_25px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-6 lg:p-8">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => handleFileSelected("camera", event)}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFileSelected("upload", event)}
        />

        <header className="mb-6 flex flex-col gap-4 rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              <Fish className="h-4 w-4" />
              VisApp
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Foto's eerst, details daarna</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Maak een foto, upload een bestand of kies direct uit Google Foto&apos;s. Daarna zie je de preview en komt de foto meteen terug in je overzicht.
            </p>
          </div>

          {user ? (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <div className="text-sm">
                <p className="font-semibold">{user.name || user.email}</p>
                <p className="text-slate-300">{user.role}</p>
              </div>
              <button
                onClick={logout}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <LogOut className="mr-2 h-4 w-4" /> Uitloggen
              </button>
            </div>
          ) : null}
        </header>

        {!user ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Eerst inloggen</h2>
            <p className="mt-2 text-sm text-slate-600">Log in om je foto&apos;s te importeren, op te slaan en terug te zien in je galerij.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {googleConfigured ? (
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    if (credentialResponse.credential) {
                      void handleGoogleLogin(credentialResponse.credential);
                    } else {
                      setError("Google gaf geen token terug.");
                    }
                  }}
                  onError={() => setError("Google login is afgebroken.")}
                />
              ) : (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Google login staat uit. Zet `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`.
                </div>
              )}
              <button
                onClick={() => void handleDevLogin()}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
              >
                Dev-login
              </button>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">1. Kies je foto</h2>
                  <p className="text-sm text-slate-600">Deze acties staan bewust bovenaan: hier begint de hele flow.</p>
                </div>
                <p className="text-sm text-slate-500">Daarna opslaan en direct terugzien in je galerij.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <ActionButton
                  icon={<Camera className="h-6 w-6" />}
                  title="Foto maken"
                  subtitle="Op mobiel opent dit direct je camera."
                  onClick={openCameraCapture}
                />
                <ActionButton
                  icon={<ImagePlus className="h-6 w-6" />}
                  title="Foto uploaden"
                  subtitle="Kies een bestaande foto van je apparaat."
                  onClick={openUploadPicker}
                />
                <ActionButton
                  icon={importing ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <CloudSun className="h-6 w-6" />}
                  title="Google Foto's"
                  subtitle="Open de echte picker en kies daar je foto's."
                  onClick={startPickerImport}
                  disabled={importing}
                />
              </div>
            </section>

            {pendingPhoto ? (
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
                  <div className="overflow-hidden rounded-[1.5rem] bg-slate-100">
                    <img src={pendingPhoto.previewUrl} alt="Geselecteerde foto" className="h-full max-h-[28rem] w-full object-cover" />
                  </div>
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">2. Controleer en sla op</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Bron: {pendingPhoto.source === "camera" ? "camera" : "bestand upload"}. De foto wordt na opslaan meteen zichtbaar onderaan.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Soort voor deze foto</label>
                      <div className="flex flex-wrap gap-2">
                        {speciesOptions.map((species) => {
                          const active = species === selectedSpecies;
                          return (
                            <button
                              key={species}
                              type="button"
                              onClick={() => setSelectedSpecies(species)}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                active ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {species}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={savePendingPhoto}
                        disabled={savingUpload}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {savingUpload ? "Opslaan..." : "Opslaan in galerij"}
                      </button>
                      <button
                        type="button"
                        onClick={clearPendingPhoto}
                        className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-3">
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
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">3. Je foto's</h2>
                  <p className="text-sm text-slate-600">Hier zie je direct wat er al is opgeslagen.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {speciesOptions.map((species) => {
                    const active = species === selectedSpecies;
                    return (
                      <button
                        key={species}
                        type="button"
                        onClick={() => setSelectedSpecies(species)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {species}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-3 text-sm text-slate-500">{photoCount} foto(s) zichtbaar voor {selectedSpecies.toLowerCase()}.</div>

              {loadingPhotos ? (
                <p className="text-sm text-slate-500">Foto&apos;s laden...</p>
              ) : photos.length === 0 ? (
                <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  Nog geen foto&apos;s voor deze soort. Gebruik bovenaan een van de drie acties om te beginnen.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {photos.map((photo) => (
                    <article key={photo.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                      <img src={photo.imageUrl} alt={photo.species} className="h-52 w-full object-cover" />
                      <div className="space-y-3 p-4 text-sm">
                        <div>
                          <p className="font-semibold text-slate-900">{photo.locationName}</p>
                          <p className="text-slate-600">
                            {new Date(photo.takenAt).toLocaleDateString("nl-NL")} om{" "}
                            {new Date(photo.takenAt).toLocaleTimeString("nl-NL", {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </p>
                        </div>
                        <p className="text-slate-700">
                          {photo.weather.tempC ?? "-"} C | {photo.weather.pressureHpa ?? "-"} hPa | {photo.weather.windKph ?? "-"} km/u
                        </p>
                        <p className="text-xs text-slate-500">Toegevoegd door {photo.userEmail}</p>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Soort</label>
                          <select
                            value={photo.species}
                            onChange={(event) => void updateSpecies(photo.id, event.target.value as SpeciesName)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
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
            </section>
          </div>
        )}

        {error ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {info ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{info}</p> : null}
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("BESTAND_LEZEN_MISLUKT"));
    };
    reader.onerror = () => reject(new Error("BESTAND_LEZEN_MISLUKT"));
    reader.readAsDataURL(file);
  });
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  disabled = false
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-32 flex-col items-start justify-between rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-800 p-5 text-left text-white shadow-sm transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="inline-flex rounded-2xl bg-white/10 p-3">{icon}</span>
      <span className="block">
        <span className="block text-lg font-bold">{title}</span>
        <span className="mt-1 block text-sm text-slate-200">{subtitle}</span>
      </span>
    </button>
  );
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
    <article className={`rounded-[1.5rem] border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-3 inline-flex rounded-xl bg-white p-2 shadow-sm">{icon}</div>
      <p className="text-sm text-slate-600">{title}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
