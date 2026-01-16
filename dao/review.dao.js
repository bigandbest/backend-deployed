import prisma from '../utils/prisma.js';

class ReviewDAO {
    async createReview(data) {
        return await prisma.$transaction(async (tx) => {
            const review = await tx.product_reviews.create({
                data
            });

            // Update product rating and review count
            const stats = await tx.product_reviews.aggregate({
                where: { product_id: data.product_id },
                _avg: { rating: true },
                _count: { id: true }
            });

            await tx.products.update({
                where: { id: data.product_id },
                data: {
                    rating: stats._avg.rating || 0,
                    review_count: stats._count.id || 0
                }
            });

            return review;
        });
    }

    async getReviewsByProductId(productId, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.product_reviews.findMany({
            where: { product_id: productId },
            skip,
            take: limit,
            orderBy: { created_at: 'desc' }
        });
    }

    async deleteReview(id) {
        return await prisma.$transaction(async (tx) => {
            const review = await tx.product_reviews.delete({
                where: { id }
            });

            // Update product stats
            const stats = await tx.product_reviews.aggregate({
                where: { product_id: review.product_id },
                _avg: { rating: true },
                _count: { id: true }
            });

            await tx.products.update({
                where: { id: review.product_id },
                data: {
                    rating: stats._avg.rating || 0,
                    review_count: stats._count.id || 0
                }
            });

            return review;
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
}

export default new ReviewDAO();
