import prisma from '../config/prisma.js';

class ShippingRateDAO {
    async getByPincodeAndWeight(pincode, weight) {
        const results = await prisma.$queryRaw`
      SELECT * FROM shipping_rates 
      WHERE pincode = ${pincode} 
      AND weight_from <= ${weight} 
      AND weight_to >= ${weight} 
      LIMIT 1
    `;
        return results[0] || null;
    }

    async create(data) {
        const columns = Object.keys(data).join(', ');
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const result = await prisma.$queryRawUnsafe(`
      INSERT INTO shipping_rates (${columns})
      VALUES (${placeholders})
      RETURNING *
    `, ...values);

        return result[0];
    }
}

export default new ShippingRateDAO();
