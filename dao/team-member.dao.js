import prisma from '../config/prisma.js';

class TeamMemberDAO {
    async create(data) {
        return await prisma.team_members.create({ data });
    }

    async list() {
        return await prisma.team_members.findMany({
            orderBy: { created_at: 'asc' }
        });
    }

    async getById(id) {
        return await prisma.team_members.findUnique({
            where: { id }
        });
    }

    async update(id, data) {
        return await prisma.team_members.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.team_members.delete({
            where: { id }
        });
    }
}

export default new TeamMemberDAO();
