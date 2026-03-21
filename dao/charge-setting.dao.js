import prisma from '../config/prisma.js';

class ChargeSettingDAO {
    async get() {
        return await prisma.charge_settings.findUnique({
            where: { id: 1 }
        });
    }

    async update(data) {
        // Filter out fields not in the Prisma schema (e.g., delivery_charge)
        const { delivery_charge, ...dbData } = data;
        
        return await prisma.charge_settings.upsert({
            where: { id: 1 },
            update: {
                ...dbData,
                updated_at: new Date()
            },
            create: {
                id: 1,
                ...dbData
            }
        });
    }
}

export default new ChargeSettingDAO();
