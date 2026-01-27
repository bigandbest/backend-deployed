import prisma from '../config/prisma.js';

class TaxRateDAO {
    async getByState(state) {
        const results = await prisma.$queryRaw`
      SELECT * FROM tax_rates 
      WHERE state = ${state} 
      LIMIT 1
    `;
        return results[0] || null;
    }

    async create(data) {
        const columns = Object.keys(data).join(', ');
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const result = await prisma.$queryRawUnsafe(`
      INSERT INTO tax_rates (${columns})
      VALUES (${placeholders})
      RETURNING *
    `, ...values);

        return result[0];
    }
}

export default new TaxRateDAO();
