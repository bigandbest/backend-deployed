
import axios from 'axios';

const BASE_URL = 'http://localhost:8000';

async function verifyServer() {
    console.log('🔍 Verifying Server Startup...');

    try {
        // 1. Check Health Endpoint
        console.log('1️⃣ Checking Health Endpoint...');
        try {
            const healthRes = await axios.get(`${BASE_URL}/api/debug/health`);
            if (healthRes.data.success) {
                console.log('✅ Health Check: PASSED');
            } else {
                console.error('❌ Health Check: FAILED (Invalid Response)', healthRes.data);
            }
        } catch (error) {
            // Fallback to root or just simple connect if debug/health doesn't exist
            console.log('⚠️ /api/debug/health failed, trying root...');
            try {
                await axios.get(`${BASE_URL}/`);
                console.log('✅ Root Connect: PASSED');
            } catch (err) {
                console.error('❌ Connectivity Check: FAILED', err.message);
            }
        }

        // 2. Check Categories (Simple Read)
        console.log('2️⃣ Checking Categories (Read Operation)...');
        try {
            const catRes = await axios.get(`${BASE_URL}/api/categories`);
            if (catRes.data.success) {
                console.log(`✅ Categories Read: PASSED (Found ${catRes.data.categories?.length || 0} categories)`);
            } else {
                console.error('❌ Categories Read: FAILED (Success=false)', catRes.data);
            }
        } catch (error) {
            console.error('❌ Categories Read: FAILED', error.message);
        }

    } catch (error) {
        console.error('❌ Verification Script Failed:', error);
    }
}

verifyServer();
