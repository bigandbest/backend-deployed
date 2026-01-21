import axios from "axios";

const BASE_URL = "http://localhost:8000/api";

const endpoints = [
    { name: "Admin Products (Create)", method: "POST", url: `${BASE_URL}/admin/products`, expectedStatus: 201, needsPayload: true },
    { name: "Categories (List)", method: "GET", url: `${BASE_URL}/categories`, expectedStatus: 200 },
    { name: "Brands (List)", method: "GET", url: `${BASE_URL}/brands`, expectedStatus: 200 },
    // { name: "Stores", method: "GET", url: `${BASE_URL}/stores`, expectedStatus: 200 }, // Skipping store for now as I didn't touch it
];

async function verifyRoutes() {
    console.log("🚀 Verifying API Routes...");

    for (const endpoint of endpoints) {
        try {
            console.log(`Checking ${endpoint.name} -> ${endpoint.method} ${endpoint.url}...`);

            let res;
            if (endpoint.method === "GET") {
                res = await axios.get(endpoint.url);
            } else if (endpoint.method === "POST" && endpoint.needsPayload) {
                // Send dummy payload just to check if route exists (even if it 400s validation, it means route exists)
                // But my CreateProduct 201s on success. 
                // Let's expect 400 or 500 if payload is bad, BUT NOT 404.
                try {
                    res = await axios.post(endpoint.url, {});
                } catch (e) {
                    if (e.response && e.response.status !== 404) {
                        console.log(`✅ ${endpoint.name} exists! (Got ${e.response.status} which is NOT 404)`);
                        continue;
                    }
                    throw e;
                }
            }

            if (res && res.status === endpoint.expectedStatus) {
                console.log(`✅ ${endpoint.name} is Working!`);
            } else {
                console.warn(`⚠️ ${endpoint.name} returned status ${res?.status}`);
            }

        } catch (error) {
            if (error.response) {
                if (error.response.status === 404) {
                    console.error(`❌ ${endpoint.name} FAILED: 404 Not Found (Route missing or wrong path)`);
                } else {
                    // If not 404, the route exists but maybe logic failed
                    console.log(`✅ ${endpoint.name} Found (Status ${error.response.status})`);
                }
            } else {
                console.error(`❌ ${endpoint.name} Error: ${error.message}`);
            }
        }
    }
}

verifyRoutes();
