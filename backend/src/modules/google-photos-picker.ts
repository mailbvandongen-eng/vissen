type PickerSession = {
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

const pickerApiBase = "https://photospicker.googleapis.com/v1";

async function googlePhotosRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${pickerApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Photos Picker API ${response.status}: ${errorBody}`);
  }

  return (await response.json()) as T;
}

export async function createPickerSession(accessToken: string, maxItemCount?: number) {
  const body =
    typeof maxItemCount === "number" ? { pickingConfig: { maxItemCount } } : { pickingConfig: {} };

  return await googlePhotosRequest<PickerSession>("/sessions", accessToken, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function getPickerSession(accessToken: string, sessionId: string) {
  return await googlePhotosRequest<PickerSession>(`/sessions/${sessionId}`, accessToken, {
    method: "GET"
  });
}

export async function listPickerMediaItems(
  accessToken: string,
  sessionId: string,
  pageToken?: string
) {
  const query = new URLSearchParams();
  if (pageToken) {
    query.set("pageToken", pageToken);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return await googlePhotosRequest<PickerMediaItemsResponse>(
    `/sessions/${sessionId}/mediaItems${suffix}`,
    accessToken,
    {
      method: "GET"
    }
  );
}

