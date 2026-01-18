import prisma from '../config/prisma.js';

class AboutUsDAO {
    async getContent() {
        return await prisma.about_us_content.findFirst();
    }

    async updateContent(id, data) {
        // If id is provided, update that specific record
        if (id) {
            return await prisma.about_us_content.update({
                where: { id },
                data
            });
        }

        // If no ID provided, check if a record already exists (singleton pattern)
        const existing = await prisma.about_us_content.findFirst();

        if (existing) {
            return await prisma.about_us_content.update({
                where: { id: existing.id },
                data
            });
        }

        // If no record exists, create a new one
        return await prisma.about_us_content.create({
            data
        });
    }
}

export default new AboutUsDAO();
