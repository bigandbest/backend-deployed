import prisma from '../config/prisma.js';
import { uploadToCloudinary } from '../services/uploadService.js';
import multer from 'multer';

// ============ MULTER CONFIG ============
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, WebP images and PDF files are allowed'), false);
    },
});
export const sellerDocumentUploadMiddleware = upload.single('document');

// ============ UPLOAD SELLER DOCUMENT ============
export const uploadSellerDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No document file provided' });
        }

        const { document_type } = req.body;
        const validTypes = ['GSTIN_CERTIFICATE', 'PAN_CARD', 'BUSINESS_LICENSE', 'ID_PROOF', 'ADDRESS_PROOF'];

        if (!document_type || !validTypes.includes(document_type)) {
            return res.status(400).json({
                success: false,
                error: `document_type is required and must be one of: ${validTypes.join(', ')}`
            });
        }

        // Get seller profile
        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) {
            return res.status(404).json({ success: false, error: 'Seller profile not found' });
        }

        // Check if document already exists and is approved
        const existingDoc = await prisma.seller_documents.findUnique({
            where: { seller_id_document_type: { seller_id: seller.id, document_type } }
        });

        if (existingDoc && existingDoc.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'This document is already approved' });
        }

        // Upload to Cloudinary
        const result = await uploadToCloudinary(
            req.file.buffer,
            'seller-documents',
            req.file.mimetype,
        );

        if (!result.success) {
            return res.status(500).json({ success: false, error: 'Failed to upload document' });
        }

        // Upsert (create or update rejected doc)
        const doc = await prisma.seller_documents.upsert({
            where: { seller_id_document_type: { seller_id: seller.id, document_type } },
            create: {
                seller_id: seller.id,
                document_type,
                document_url: result.secure_url,
                status: 'PENDING',
            },
            update: {
                document_url: result.secure_url,
                status: 'PENDING',
                rejection_reason: null,
                reviewed_at: null,
                reviewed_by: null,
                updated_at: new Date(),
            }
        });

        // Note: We no longer auto-submit docs. The user must manually click submit.

        res.status(200).json({
            success: true,
            data: {
                id: doc.id,
                type: doc.document_type,
                url: doc.document_url,
                status: doc.status,
            },
            message: 'Document uploaded successfully',
        });
    } catch (error) {
        console.error('Upload seller document error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload document', message: error.message });
    }
};

// ============ SUBMIT SELLER VERIFICATION REQUEST ============
export const submitSellerVerificationRequest = async (req, res) => {
    try {
        const seller = await prisma.sellers.findUnique({
            where: { user_id: req.user.id },
            include: { seller_documents: true }
        });

        if (!seller) {
            return res.status(404).json({ success: false, error: 'Seller profile not found' });
        }

        if (seller.verification_status === 'VERIFIED') {
            return res.status(400).json({ success: false, error: 'You are already verified' });
        }

        const uploadedDocs = seller.seller_documents.filter(d => d.status !== 'REJECTED');
        if (uploadedDocs.length === 0) {
            return res.status(400).json({ success: false, error: 'Please upload at least one document before submitting' });
        }

        const hasRejected = seller.seller_documents.some(d => d.status === 'REJECTED');
        if (hasRejected) {
            return res.status(400).json({ success: false, error: 'Please re-upload rejected documents before submitting' });
        }

        await prisma.sellers.update({
            where: { id: seller.id },
            data: { verification_status: 'PENDING_VERIFICATION', updated_at: new Date() }
        });

        res.status(200).json({
            success: true,
            message: 'Verification request submitted successfully. We will review your documents shortly.',
        });
    } catch (error) {
        console.error('Submit seller verification request error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit request' });
    }
};
