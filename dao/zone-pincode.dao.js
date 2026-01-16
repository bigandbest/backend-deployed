import prisma from '../utils/prisma.js';

class ZonePincodeDAO {
    async listByZone(zoneId, activeOnly = true) {
        return await prisma.zone_pincodes.findMany({
            where: {
                zone_id: zoneId,
                ...(activeOnly && { is_active: true })
            },
            orderBy: { pincode: 'asc' }
        });
    }

    async getByPincode(pincode) {
        return await prisma.zone_pincodes.findMany({
            where: { pincode, is_active: true },
            include: { zone: true }
        });
    }

    async upsert(zoneId, pincode, data = {}) {
        const existing = await prisma.zone_pincodes.findFirst({
            where: { zone_id: zoneId, pincode: pincode }
        });

        if (existing) {
            return await prisma.zone_pincodes.update({
                where: { id: existing.id },
                data: { ...data }
            });
        } else {
            return await prisma.zone_pincodes.create({
                data: {
                    ...data,
                    zone_id: zoneId,
                    pincode: pincode
                }
            });
        }
    }

    async delete(id) {
        return await prisma.zone_pincodes.delete({
            where: { id }
        });
    }
}

export default new ZonePincodeDAO();
