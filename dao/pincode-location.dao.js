import prisma from '../config/prisma.js';

class PincodeLocationDAO {
    async getByPincode(pincode) {
        return await prisma.pincode_locations.findUnique({
            where: { pincode }
        });
    }

    async upsert(pincode, data) {
        return await prisma.pincode_locations.upsert({
            where: { pincode },
            update: data,
            create: { ...data, pincode }
        });
    }

    async listAll() {
        return await prisma.pincode_locations.findMany({
            orderBy: { pincode: 'asc' }
        });
    }

    async delete(pincode) {
        return await prisma.pincode_locations.delete({
            where: { pincode }
        });
    }
}

export default new PincodeLocationDAO();
