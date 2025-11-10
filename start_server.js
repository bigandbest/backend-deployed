// Backend server startup script
import app from './server.js';

const PORT = process.env.PORT || 8000;

console.log('🚀 Starting BigandBest Backend Server...');
console.log('📍 Port:', PORT);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running successfully on port ${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📋 COD Orders API: http://localhost:${PORT}/api/cod-orders`);
  console.log(`🛠️  Available Routes: http://localhost:${PORT}/__routes`);
  console.log('');
  console.log('🎯 COD Orders Endpoints:');
  console.log(`   POST   /api/cod-orders/create`);
  console.log(`   GET    /api/cod-orders/all`);
  console.log(`   GET    /api/cod-orders/user/:user_id`);
  console.log(`   GET    /api/cod-orders/stats`);
  console.log(`   GET    /api/cod-orders/:id`);
  console.log(`   PUT    /api/cod-orders/status/:id`);
  console.log(`   DELETE /api/cod-orders/:id`);
  console.log('');
  console.log('🔥 Server ready for COD orders!');
});