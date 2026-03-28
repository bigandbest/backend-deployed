// utils/geocode.js
// Waterfall geocoding: Nominatim → Photon → null
// Never blocks the caller — always run via setImmediate

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocodeWithNominatim(address) {
    try {
        const encoded = encodeURIComponent(address);
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'BigBastMart/1.0 (contact@bigbastmart.com)',
                    'Accept-Language': 'en',
                },
            }
        );
        const data = await res.json();
        if (!data.length) return null;
        return {
            latitude: parseFloat(parseFloat(data[0].lat).toFixed(7)),
            longitude: parseFloat(parseFloat(data[0].lon).toFixed(7)),
            display_name: data[0].display_name,
            source: 'nominatim',
        };
    } catch (err) {
        console.error('[geocode] Nominatim failed:', err.message);
        return null;
    }
}

async function geocodeWithPhoton(address) {
    try {
        const encoded = encodeURIComponent(address);
        const res = await fetch(`https://photon.komoot.io/api/?q=${encoded}&limit=1`);
        const data = await res.json();
        if (!data.features?.length) return null;
        const [lon, lat] = data.features[0].geometry.coordinates;
        return {
            latitude: parseFloat(lat.toFixed(7)),
            longitude: parseFloat(lon.toFixed(7)),
            display_name: data.features[0].properties.name || address,
            source: 'photon',
        };
    } catch (err) {
        console.error('[geocode] Photon failed:', err.message);
        return null;
    }
}

/**
 * Main geocoder — waterfall through Nominatim then Photon.
 * Returns { latitude, longitude, display_name, source } or null.
 */
export async function geocodeAddress(address) {
    if (!address || address.trim().length < 5) return null;

    const result = await geocodeWithNominatim(address);
    if (result) return result;

    // Nominatim TOS: max 1 req/sec
    await delay(1100);

    const fallback = await geocodeWithPhoton(address);
    return fallback ?? null;
}

/**
 * Build a single address string from structured fields.
 * Include as many fields as possible to improve geocoding accuracy.
 */
export function buildAddressString({ addressLine1, addressLine2, city, state, pincode, country = 'India' }) {
    return [addressLine1, addressLine2, city, state, pincode, country]
        .filter(Boolean)
        .join(', ');
}
