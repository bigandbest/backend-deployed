// controller/bankAccountController.js
// Admin management of company bank account for COD deposits.

import prisma from '../config/prisma.js';

/**
 * GET /api/admin/bank-account
 * Fetch current active bank account settings.
 */
export const getBankAccount = async (req, res) => {
    try {
        const account = await prisma.bank_account_settings.findFirst({
            where: { is_active: true },
        });

        if (!account) {
            return res.status(404).json({ success: false, error: 'No active bank account configured' });
        }

        res.status(200).json({
            success: true,
            data: {
                id: account.id,
                account_holder_name: account.account_holder_name,
                account_number: account.account_number,
                bank_name: account.bank_name,
                ifsc_code: account.ifsc_code,
                upi_id: account.upi_id,
                instructions: account.instructions,
                admin_name: account.admin_name,
                admin_phone: account.admin_phone,
                created_at: account.created_at,
                updated_at: account.updated_at,
            },
        });
    } catch (err) {
        console.error('getBankAccount error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch bank account settings' });
    }
};

/**
 * POST /api/admin/bank-account
 * Create or update bank account settings (deactivates previous).
 */
export const saveBankAccount = async (req, res) => {
    try {
        const { account_holder_name, account_number, bank_name, ifsc_code, upi_id, instructions, admin_name, admin_phone } = req.body;

        // Validate required fields
        if (!account_holder_name || !account_number || !bank_name || !ifsc_code) {
            return res.status(400).json({
                success: false,
                error: 'account_holder_name, account_number, bank_name, and ifsc_code are required',
            });
        }

        await prisma.$transaction(async (tx) => {
            // Deactivate previous account
            await tx.bank_account_settings.updateMany({
                where: { is_active: true },
                data: { is_active: false, updated_at: new Date() },
            });

            // Create new account
            await tx.bank_account_settings.create({
                data: {
                    account_holder_name,
                    account_number,
                    bank_name,
                    ifsc_code,
                    upi_id: upi_id || null,
                    instructions: instructions || null,
                    admin_name: admin_name || null,
                    admin_phone: admin_phone || null,
                    is_active: true,
                },
            });
        });

        res.status(201).json({
            success: true,
            message: 'Bank account settings updated successfully',
        });
    } catch (err) {
        console.error('saveBankAccount error:', err);
        if (err.code === 'P2002') {
            return res.status(400).json({ success: false, error: 'Account number already exists' });
        }
        res.status(500).json({ success: false, error: 'Failed to save bank account settings' });
    }
};

/**
 * GET /api/admin/bank-account/all
 * Fetch all bank accounts (active and inactive) for admin audit.
 */
export const getAllBankAccounts = async (req, res) => {
    try {
        const accounts = await prisma.bank_account_settings.findMany({
            orderBy: { created_at: 'desc' },
        });

        res.status(200).json({
            success: true,
            data: accounts.map(a => ({
                id: a.id,
                account_holder_name: a.account_holder_name,
                account_number: a.account_number,
                bank_name: a.bank_name,
                ifsc_code: a.ifsc_code,
                upi_id: a.upi_id,
                is_active: a.is_active,
                created_at: a.created_at,
                updated_at: a.updated_at,
            })),
        });
    } catch (err) {
        console.error('getAllBankAccounts error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch bank accounts' });
    }
};

/**
 * GET /api/rider/cod/bank-account
 * Rider views the company bank account for COD payments.
 */
export const getRiderBankAccount = async (req, res) => {
    try {
        const account = await prisma.bank_account_settings.findFirst({
            where: { is_active: true },
        });

        if (!account) {
            return res.status(404).json({ success: false, error: 'No active bank account configured' });
        }

        res.status(200).json({
            success: true,
            data: {
                account_holder_name: account.account_holder_name,
                account_number: account.account_number,
                bank_name: account.bank_name,
                ifsc_code: account.ifsc_code,
                upi_id: account.upi_id,
                instructions: account.instructions,
                admin_name: account.admin_name,
                admin_phone: account.admin_phone,
            },
        });
    } catch (err) {
        console.error('getRiderBankAccount error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch bank account details' });
    }
};

/**
 * GET /api/settings/rider/admin-contact
 * Fetch the primary administrator's contact name and phone for support.
 * Returns info from the 'users' table where role is 'ADMIN'.
 */
export const getAdminProfileContact = async (req, res) => {
    try {
        const admin = await prisma.users.findFirst({
            where: { role: 'ADMIN' },
            select: {
                name: true,
                phone: true,
                email: true,
            },
            orderBy: { created_at: 'asc' }, // Get the earliest created admin (usually super admin)
        });

        if (!admin) {
            return res.status(404).json({ success: false, error: 'No administrator details found' });
        }

        res.status(200).json({
            success: true,
            data: {
                name: admin.name,
                phone: admin.phone,
                email: admin.email,
            },
        });
    } catch (err) {
        console.error('getAdminProfileContact error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch admin contact details' });
    }
};
