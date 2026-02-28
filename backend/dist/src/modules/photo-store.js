const store = new Map();
function fakeWeather(lat, lon, takenAt) {
    const stamp = new Date(takenAt).getTime() / 1000;
    const drift = Math.abs(Math.round(lat * 10 + lon * 7 + (stamp % 97)));
    return {
        pressureHpa: 995 + (drift % 35),
        tempC: 4 + (drift % 19),
        windKph: 5 + (drift % 26)
    };
}
export function importPickerSelection(userId, items) {
    const imported = [];
    for (const item of items) {
        const existing = Array.from(store.values()).find((record) => record.userId === userId && record.sourceItemId === item.sourceItemId);
        if (existing) {
            imported.push(existing);
            continue;
        }
        const id = `photo-${crypto.randomUUID()}`;
        const weather = fakeWeather(item.lat, item.lon, item.takenAt);
        const next = {
            id,
            userId,
            sourceItemId: item.sourceItemId,
            imageUrl: item.imageUrl,
            thumbnailUrl: item.thumbnailUrl ?? item.imageUrl,
            takenAt: item.takenAt,
            lat: item.lat,
            lon: item.lon,
            locationName: item.locationName ?? `${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`,
            species: item.species ?? "Snoek",
            weather
        };
        store.set(next.id, next);
        imported.push(next);
    }
    return imported;
}
export function listPhotos(userId, species) {
    const all = Array.from(store.values()).filter((record) => record.userId === userId);
    if (!species) {
        return all;
    }
    return all.filter((record) => record.species.toLowerCase() === species.toLowerCase());
}
export function updatePhotoSpecies(userId, photoId, species) {
    const photo = store.get(photoId);
    if (!photo || photo.userId !== userId) {
        return null;
    }
    const next = { ...photo, species };
    store.set(photoId, next);
    return next;
}
export function speciesDashboard(userId, speciesName) {
    const rows = listPhotos(userId, speciesName);
    if (rows.length === 0) {
        return {
            species: speciesName,
            count: 0,
            averages: {
                pressureHpa: null,
                tempC: null,
                windKph: null
            }
        };
    }
    const pressure = rows.reduce((sum, row) => sum + row.weather.pressureHpa, 0) / rows.length;
    const temp = rows.reduce((sum, row) => sum + row.weather.tempC, 0) / rows.length;
    const wind = rows.reduce((sum, row) => sum + row.weather.windKph, 0) / rows.length;
    return {
        species: rows[0].species,
        count: rows.length,
        averages: {
            pressureHpa: Number(pressure.toFixed(1)),
            tempC: Number(temp.toFixed(1)),
            windKph: Number(wind.toFixed(1))
        }
    };
}
