import prisma from '../config/prisma.js';

class WalletTransactionDAO {
    async listByWallet(walletId, pagination = {}) {
        const { page = 1, limit = 20 } = pagination;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.wallet_transactions.findMany({
                where: { wallet_id: walletId },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.wallet_transactions.count({ where: { wallet_id: walletId } })
        ]);

        return { items, total, page, limit };
    }

    async listByUser(userId, pagination = {}) {
        const { page = 1, limit = 20 } = pagination;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.wallet_transactions.findMany({
                where: { user_id: userId },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.wallet_transactions.count({ where: { user_id: userId } })
        ]);

        return { items, total, page, limit };
    }

    async getById(id) {
        return await prisma.wallet_transactions.findUnique({
            where: { id },
            include: { wallet: true, user: true }
        });
    }
}

export default new WalletTransactionDAO();
