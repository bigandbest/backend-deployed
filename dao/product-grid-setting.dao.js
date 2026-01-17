import prisma from '../config/prisma.js';

class ProductGridSettingDAO {
    async getSettings() {
        const result = await prisma.$queryRaw`
            SELECT is_visible FROM product_grid_settings LIMIT 1
        `;
        return result[0];
    }

    async updateSettings(isVisible) {
        const result = await prisma.$queryRaw`
            UPDATE product_grid_settings 
            SET is_visible = ${isVisible} 
            WHERE id = '1'
            RETURNING *
        `;
        return result[0];
    }
}

export default new ProductGridSettingDAO();
