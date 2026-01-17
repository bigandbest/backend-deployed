import prisma from '../config/prisma.js';

class DeliveryZoneDAO {
    async create(data) {
        return await prisma.delivery_zones.create({ data });
    }

    async getById(id) {
        return await prisma.delivery_zones.findUnique({
            where: { id },
            include: {
                zone_pincodes: true,
                warehouse_zones: {
                    include: { warehouse: true }
                }
            }
        });
    }

    async list(filters = {}) {
        const { is_active = true, is_nationwide } = filters;
        return await prisma.delivery_zones.findMany({
            where: {
                ...(is_active !== undefined && { is_active }),
                ...(is_nationwide !== undefined && { is_nationwide })
            },
            orderBy: { name: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.delivery_zones.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.delivery_zones.delete({
            where: { id }
        });
    }

    async findByName(name) {
        return await prisma.delivery_zones.findFirst({
            where: { name }
        });
    }

    async findPincodeInZone(zoneId, pincode) {
        return await prisma.zone_pincodes.findFirst({
            where: { zone_id: zoneId, pincode }
        });
    }

    async upsertPincode(zoneId, pincodeData) {
        const existing = await this.findPincodeInZone(zoneId, pincodeData.pincode);
        if (existing) {
            return await prisma.zone_pincodes.update({
                where: { id: existing.id },
                data: { ...pincodeData, is_active: true }
            });
        } else {
            return await prisma.zone_pincodes.create({
                data: { ...pincodeData, zone_id: zoneId, is_active: true }
            });
        }
    }

    async deletePincodesByZone(zoneId) {
        return await prisma.zone_pincodes.deleteMany({
            where: { zone_id: zoneId }
        });
    }

    async createPincodes(pincodesData) {
        return await prisma.zone_pincodes.createMany({
            data: pincodesData
        });
    }

    // Helpers used by controller logic if needed (e.g., individual create/update)
    async createPincode(data) {
        return await prisma.zone_pincodes.create({ data });
    }

    async updatePincode(id, data) {
        return await prisma.zone_pincodes.update({ where: { id }, data });
    }

    async replacePincodes(zoneId, pincodesData) {
        return await prisma.$transaction([
            prisma.zone_pincodes.deleteMany({ where: { zone_id: zoneId } }),
            prisma.zone_pincodes.createMany({ data: pincodesData })
        ]);
    }

    async checkProductUsage(zoneId) {
        // Check if any product uses this zone via allowed_zone_ids array
        return await prisma.products.findMany({
            where: {
                allowed_zone_ids: {
                    has: zoneId
                }
            },
            take: 5,
            select: { id: true, name: true }
        });
    }

    async getStatistics() {
        const totalZones = await prisma.delivery_zones.count();
        const activeZones = await prisma.delivery_zones.count({ where: { is_active: true } });
        const totalPincodes = await prisma.zone_pincodes.count();
        return { totalZones, activeZones, totalPincodes };
    }

    async getZonesForPincodeRpc(pincode) {
        // Uses Prisma queryRaw to call database function
        return await prisma.$queryRaw`SELECT * FROM get_zones_for_pincode(${pincode})`;
    }

    async canDeliverToPincodeRpc(productId, pincode) {
        const result = await prisma.$queryRaw`SELECT can_deliver_to_pincode(${productId}, ${pincode})`;
        // Result is [{ can_deliver_to_pincode: boolean }]
        // Postgres functions return array of rows.
        return result[0]?.can_deliver_to_pincode;
    }
}

export default new DeliveryZoneDAO();
