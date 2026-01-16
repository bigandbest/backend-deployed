import prisma from '../utils/prisma.js';

class ChargeSettingDAO {
    async get() {
        return await prisma.charge_settings.findUnique({
            where: { id: 1 }
        });
    }

    async update(data) {
        return await prisma.charge_settings.upsert({
            where: { id: 1 },
            update: {
                ...data,
                updated_at: new Date()
            },
            create: {
                id: 1,
                ...data
            }
        });
    }
}

export default new ChargeSettingDAO();
