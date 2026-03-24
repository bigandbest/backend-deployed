import http from 'http';

const API_BASE_URL = 'http://localhost:8000'; // Make sure this matches your dev server port

function testAvailability() {
  const postData = JSON.stringify({
    items: [
      {
        product_id: 'e065866a-5c1a-4af5-b638-d809e0c08590', // test
        variant_id: 'bc6ea113-a6e9-4a36-881d-42bf4a4d1a09', // Test2
        quantity: 2
      }
    ],
    pincode: '700129' 
  });

  const options = {
    hostname: 'localhost',
    port: 8000,
    path: '/api/productsroute/availability/check-cart',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        console.log('Availability Check Result:', JSON.stringify(parsedData, null, 2));
      } catch (e) {
        console.error('Error parsing response:', e.message);
        console.log('Raw Response:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

testAvailability();
