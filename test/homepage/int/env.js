// MUST be the first import of every integration spec: it points the app's global Prisma client at the scratch database
// BEFORE config/prisma.js is evaluated, and refuses to run against anything that is not localhost.
//
//   TEST_DATABASE_URL=postgresql://postgres@localhost:5433/scratch npm run test:homepage:int
//
// The database needs the current schema (`DATABASE_URL=<scratch> npx prisma db push`), nothing else — every spec builds
// its own fixtures and TRUNCATEs the tables it uses. The dev/prod DATABASE_URL from .env is never read.
const url = process.env.TEST_DATABASE_URL;
export const INT_ENABLED = !!url;
if (url) {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`refusing to run integration tests against non-local database host "${host}"`);
  }
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}
process.env.REDIS_PORT = process.env.REDIS_PORT_TEST || '6391'; // closed port: Redis helpers swallow errors, nothing shared is touched
process.env.HOMEPAGE_CACHE = 'off';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.NODE_ENV = 'test';
