import prisma from '../config/prisma.js';

class WalletDAO {
    async getByUserId(userId) {
        return await prisma.wallets.findUnique({
            where: { user_id: userId },
            include: { transactions: { take: 10, orderBy: { created_at: 'desc' } } }
        });
    }

    async create(userId) {
        return await prisma.wallets.create({
            data: { user_id: userId, balance: 0 }
        });
    }

    async updateBalance(walletId, amount, type, referenceType, referenceId, description, metadata = {}) {
        return await prisma.$transaction(async (tx) => {
            const wallet = await tx.wallets.findUnique({
                where: { id: walletId },
                select: { balance: true, user_id: true }
            });

            if (!wallet) throw new Error('Wallet not found');
            if (wallet.is_frozen) throw new Error('Wallet is frozen');

            const balanceBefore = wallet.balance;
            const balanceAfter = balanceBefore.add(amount);

            if (balanceAfter.lt(0)) throw new Error('Insufficient wallet balance');

            const [updatedWallet, transaction] = await Promise.all([
                tx.wallets.update({
                    where: { id: walletId },
                    data: {
                        balance: balanceAfter,
                        updated_at: new Date(),
                        version: { increment: 1 }
                    }
                }),
                tx.wallet_transactions.create({
                    data: {
                        wallet_id: walletId,
                        user_id: wallet.user_id,
                        transaction_type: type,
                        amount: amount,
                        balance_before: balanceBefore,
                        balance_after: balanceAfter,
                        reference_type: referenceType,
                        reference_id: referenceId,
                        description: description,
                        metadata: metadata,
                        // Expanded fields
                        razorpay_order_id: metadata?.razorpay_order_id || null,
                        razorpay_payment_id: metadata?.razorpay_payment_id || null,
                        created_by: metadata?.created_by || null,
                        idempotency_key: metadata?.idempotency_key || null,
                        status: 'COMPLETED'
                    }
                })
            ]);

            return { updatedWallet, transaction };
        });
    }

    async freeze(walletId, reason, adminId) {
        return await prisma.wallets.update({
            where: { id: walletId },
            data: {
                is_frozen: true,
                frozen_reason: reason,
                frozen_by: adminId,
                frozen_at: new Date(),
                updated_at: new Date()
            }
        });
    }

    async unfreeze(walletId) {
        return await prisma.wallets.update({
            where: { id: walletId },
            data: {
                is_frozen: false,
                frozen_reason: null,
                frozen_by: null,
                frozen_at: null,
                updated_at: new Date()
            }
        });
    }

    async createPendingTransaction(data) {
        return await prisma.wallet_transactions.create({
            data: {
                ...data,
                status: 'PENDING',
                balance_before: 0, // Placeholder, actual balance used at completion
                balance_after: 0
            }
        });
    }

    async completeTopupTransaction(transactionId, razorpayPaymentId, razorpaySignature) {
        return await prisma.$transaction(async (tx) => {
            const transaction = await tx.wallet_transactions.findUnique({
                where: { id: transactionId }
            });

            if (!transaction) throw new Error('Transaction not found');
            if (transaction.status === 'COMPLETED') return { transaction, alreadyProcessed: true };

            const wallet = await tx.wallets.findUnique({
                where: { id: transaction.wallet_id }
            });

            const balanceBefore = wallet.balance;
            const balanceAfter = balanceBefore.add(transaction.amount);

            const [updatedWallet, updatedTransaction] = await Promise.all([
                tx.wallets.update({
                    where: { id: transaction.wallet_id },
                    data: {
                        balance: balanceAfter,
                        updated_at: new Date(),
                        version: { increment: 1 }
                    }
                }),
                tx.wallet_transactions.update({
                    where: { id: transactionId },
                    data: {
                        status: 'COMPLETED',
                        balance_before: balanceBefore,
                        balance_after: balanceAfter,
                        razorpay_payment_id: razorpayPaymentId,
                        metadata: {
                            ...(transaction.metadata || {}),
                            razorpay_signature: razorpaySignature,
                            completion_time: new Date()
                        }
                    }
                })
            ]);

            return { updatedWallet, updatedTransaction };
        });
    }
}

export default new WalletDAO();
