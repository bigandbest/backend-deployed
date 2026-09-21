// Composition root: wires the real Prisma / DAO / Redis dependencies into the feed service.
// Kept separate from HomepageFeedService so the service stays importable in tests without a DB or Redis.

import prisma from '../../config/prisma.js';
import inventoryDAO from '../../dao/inventory.dao.js';
import cartAvailabilityDAO from '../../dao/cart-availability.dao.js';
import { createHomepageFeedService } from './HomepageFeedService.js';
import { loadPlan } from './PlanLoader.js';
import { selectProducts } from './entities/ProductSelectionBatch.js';
import { hydrateProducts } from './entities/EntityHydrator.js';
import { RESOLVERS, makeCategoryLoader } from './resolvers/index.js';
import { createAvailabilityOverlay } from './AvailabilityOverlay.js';
import { cachedLoadPlan, cachedSelectProducts, cachedHydrateProducts, cachedResolver, createRedisStore } from './cache/cachedDeps.js';
import { redisDel } from '../../lib/redis.js';
import { createHomepageInvalidator } from './cache/HomepageInvalidator.js';

export const HOMEPAGE_INITIAL_COUNT = parseInt(process.env.HOMEPAGE_INITIAL_COUNT || '6', 10);

const store = await createRedisStore();
const resolvers = Object.fromEntries(Object.entries(RESOLVERS).map(([type, fn]) => [type, cachedResolver(type, fn, { store })]));

export const homepageFeedService = createHomepageFeedService({
  prisma,
  loadPlan: cachedLoadPlan(() => loadPlan(prisma), { store }),
  selectProducts: cachedSelectProducts((specs) => selectProducts(prisma, specs), { store }),
  hydrateProducts: cachedHydrateProducts((ids, opts) => hydrateProducts({ prisma, inventoryDAO }, ids, opts), { store }),
  resolvers,
  makeCategoryLoader: () => makeCategoryLoader(prisma),
  applyAvailability: createAvailabilityOverlay(cartAvailabilityDAO),
  initialCount: HOMEPAGE_INITIAL_COUNT,
});

export const homepageInvalidator = createHomepageInvalidator({ prisma, del: redisDel });
