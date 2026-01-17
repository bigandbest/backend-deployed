import prisma from '../config/prisma.js';

class ReviewDAO {
    async createReview(data) {
        return await prisma.$transaction(async (tx) => {
            const review = await tx.product_reviews.create({
                data
            });

            // Update product rating and review count
            await this._updateProductStats(tx, data.product_id);

            return review;
        });
    }

    async checkExistingReview(productId, userId) {
        return await prisma.product_reviews.findFirst({
            where: {
                product_id: productId,
                user_id: userId
            }
        });
    }

    async getReviewById(id) {
        return await prisma.product_reviews.findUnique({
            where: { id }
        });
    }

    async updateReview(id, data) {
        return await prisma.$transaction(async (tx) => {
            const review = await tx.product_reviews.update({
                where: { id },
                data
            });

            // Update product stats
            await this._updateProductStats(tx, review.product_id);

            return review;
        });
    }

    async getReviewsByProductId(productId, pagination = {}) {
        const { page = 1, limit = 10, sortBy = 'created_at', order = 'desc' } = pagination;
        const skip = (page - 1) * limit;

        const reviews = await prisma.product_reviews.findMany({
            where: { product_id: productId },
            skip,
            take: limit,
            orderBy: { [sortBy]: order }
        });

        const total = await prisma.product_reviews.count({
            where: { product_id: productId }
        });

        return { reviews, total };
    }

    async deleteReview(id) {
        return await prisma.$transaction(async (tx) => {
            const review = await tx.product_reviews.delete({
                where: { id }
            });

            // Update product stats
            await this._updateProductStats(tx, review.product_id);

            return review;
        });
    }

    async markHelpful(id) {
        return await prisma.product_reviews.update({
            where: { id },
            data: {
                helpful_count: { increment: 1 }
            }
        });
    }

    async getReviewStats(productId) {
        const reviews = await prisma.product_reviews.groupBy({
            by: ['rating'],
            where: { product_id: productId },
            _count: { id: true }
        });

        const stats = {
            averageRating: 0,
            totalReviews: 0,
            breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };

        let totalSum = 0;
        reviews.forEach(r => {
            stats.breakdown[r.rating] = r._count.id;
            stats.totalReviews += r._count.id;
            totalSum += r.rating * r._count.id;
        });

        if (stats.totalReviews > 0) {
            stats.averageRating = parseFloat((totalSum / stats.totalReviews).toFixed(1));
        }

        return stats;
    }

    // Helper to update product stats within a transaction
    async _updateProductStats(tx, productId) {
        const stats = await tx.product_reviews.aggregate({
            where: { product_id: productId },
            _avg: { rating: true },
            _count: { id: true }
        });

        await tx.products.update({
            where: { id: productId },
            data: {
                rating: stats._avg.rating || 0,
                review_count: stats._count.id || 0
            }
        });
    }
}

export default new ReviewDAO();
