import prisma from '../utils/prisma.js';

class AboutUsDAO {
    async getContent() {
        return await prisma.about_us_content.findFirst();
    }

    async updateContent(id, data) {
        return await prisma.about_us_content.upsert({
            where: { id: id || '' },
            update: data,
            create: data
        });
    }
}

export default new AboutUsDAO();
