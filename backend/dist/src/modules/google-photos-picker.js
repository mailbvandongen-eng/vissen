const pickerApiBase = "https://photospicker.googleapis.com/v1";
async function googlePhotosRequest(path, accessToken, init = {}) {
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
    return (await response.json());
}
export async function createPickerSession(accessToken, maxItemCount) {
    const body = typeof maxItemCount === "number" ? { pickingConfig: { maxItemCount } } : { pickingConfig: {} };
    return await googlePhotosRequest("/sessions", accessToken, {
        method: "POST",
        body: JSON.stringify(body)
    });
}
export async function getPickerSession(accessToken, sessionId) {
    return await googlePhotosRequest(`/sessions/${sessionId}`, accessToken, {
        method: "GET"
    });
}
export async function listPickerMediaItems(accessToken, sessionId, pageToken) {
    const query = new URLSearchParams();
    if (pageToken) {
        query.set("pageToken", pageToken);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return await googlePhotosRequest(`/sessions/${sessionId}/mediaItems${suffix}`, accessToken, {
        method: "GET"
    });
}
