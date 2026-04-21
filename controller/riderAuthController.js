import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateToken, verifyToken } from '../utils/jwtUtils.js';
import { uploadToCloudinary } from '../services/uploadService.js';
import multer from 'multer';
import admin from '../config/firebase.js';

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
export const documentUploadMiddleware = upload.single('document');

// ============ RIDER REGISTRATION ============
export const registerRider = async (req, res) => {
    try {
        const { email, password, name, phone, vehicle_type, vehicle_number, license_number, emergency_contact } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ success: false, error: 'Email, password, and name are required' });
        }

        // Check if user exists
        const existingUser = await prisma.users.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user + rider profile in transaction
        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.users.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    phone,
                    role: 'RIDER',
                    is_active: true,
                }
            });

            const rider = await tx.riders.create({
                data: {
                    user_id: user.id,
                    vehicle_type,
                    vehicle_number,
                    license_number,
                    emergency_contact,
                    verification_status: 'PENDING_VERIFICATION',
                }
            });

            return { user, rider };
        });

        const token = generateToken({
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            name: result.user.name,
            rider_id: result.rider.id,
        });

        res.status(201).json({
            success: true,
            token,
            data: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                rider_id: result.rider.id,
                verification_status: result.rider.verification_status,
            },
            message: 'Rider registered successfully. Please upload verification documents.',
        });
    } catch (error) {
        console.error('Rider registration error:', error);
        res.status(500).json({ success: false, error: 'Registration failed', message: error.message });
    }
};

// ============ RIDER LOGIN ============
export const loginRider = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const user = await prisma.users.findUnique({
            where: { email },
            include: { riders: true }
        });

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        if (user.role !== 'RIDER') {
            return res.status(403).json({ success: false, error: 'You do not have rider access' });
        }

        if (!user.password) {
            return res.status(401).json({ success: false, error: 'Account not set up for password login' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        if (user.is_active === false) {
            return res.status(403).json({ success: false, error: 'Account is deactivated' });
        }

        await prisma.users.update({
            where: { id: user.id },
            data: { last_login: new Date() }
        });

        // Auto-restore warehouse assignment on login so rider can receive orders
        // without needing a manual SQL insert.
        const rider = user.riders;
        if (rider?.id && rider.verification_status === 'VERIFIED') {
            const activeAssignment = await prisma.warehouse_riders.findFirst({
                where: { rider_id: rider.id, is_active: true },
            });

            if (!activeAssignment) {
                // Reactivate the most recent prior assignment
                const lastAssignment = await prisma.warehouse_riders.findFirst({
                    where: { rider_id: rider.id },
                    orderBy: { assigned_at: 'desc' },
                });
                if (lastAssignment) {
                    await prisma.warehouse_riders.update({
                        where: { id: lastAssignment.id },
                        data: { is_active: true, assigned_at: new Date() },
                    });
                }
            }
        }

        const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            rider_id: user.riders?.id,
        });

        res.status(200).json({
            success: true,
            token,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                role: user.role,
                rider_id: user.riders?.id,
                verification_status: user.riders?.verification_status,
                is_verified: user.riders?.is_verified,
                is_available: user.riders?.is_available,
            },
        });
    } catch (error) {
        console.error('Rider login error:', error);
        res.status(500).json({ success: false, error: 'Login failed', message: error.message });
    }
};

// ============ GET RIDER PROFILE ============
export const getRiderMe = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const user = await prisma.users.findUnique({
            where: { id: req.user.id },
            include: {
                riders: {
                    include: {
                        rider_documents: true,
                        warehouse_riders: {
                            where: { is_active: true },
                            include: { warehouses: true }
                        }
                    }
                }
            }
        });

        if (!user || user.role !== 'RIDER') {
            return res.status(404).json({ success: false, error: 'Rider not found' });
        }

        const rider = user.riders;

        // Check active shift
        let activeShift = null;
        if (rider?.current_shift_id) {
            activeShift = await prisma.attendance_logs.findUnique({
                where: { id: rider.current_shift_id }
            });
        }

        // Get today's attendance summary
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayLogs = await prisma.attendance_logs.findMany({
            where: {
                rider_id: rider?.id,
                date: today,
            },
            orderBy: { check_in_time: 'asc' }
        });

        const totalHoursToday = todayLogs.reduce((sum, log) => {
            return sum + (log.total_hours ? parseFloat(log.total_hours) : 0);
        }, 0);

        // Get wallet and earnings
        const wallet = await prisma.wallets.findFirst({
            where: { user_id: user.id }
        });

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEarnings = await prisma.wallet_transactions.findMany({
            where: {
                user_id: user.id,
                transaction_type: 'CREDIT',
                status: 'COMPLETED',
                created_at: { gte: startOfMonth }
            },
            select: { amount: true }
        });

        const totalEarningsMonth = monthEarnings.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar || user.photo_url,
                rider_id: rider?.id,
                verification_status: rider?.verification_status,
                is_verified: rider?.is_verified,
                is_available: rider?.is_available,
                is_active: rider?.is_active,
                vehicle_type: rider?.vehicle_type,
                vehicle_number: rider?.vehicle_number,
                license_number: rider?.license_number,
                emergency_contact: rider?.emergency_contact,
                documents: rider?.rider_documents?.map(d => ({
                    id: d.id,
                    type: d.document_type,
                    url: d.document_url,
                    status: d.status,
                    rejection_reason: d.rejection_reason,
                })) || [],
                warehouses: rider?.warehouse_riders?.map(wr => ({
                    id: wr.warehouses.id,
                    name: wr.warehouses.name,
                    type: wr.warehouses.type,
                })) || [],
                active_shift: activeShift ? {
                    id: activeShift.id,
                    check_in_time: activeShift.check_in_time,
                } : null,
                today_summary: {
                    total_hours: totalHoursToday.toFixed(2),
                    segments: todayLogs.length,
                    is_eligible_for_minimum_wage: totalHoursToday >= 8,
                },
                wallet: {
                    balance: wallet ? Number(wallet.balance) : 0,
                    is_frozen: wallet?.is_frozen || false,
                },
                earnings: {
                    this_month: totalEarningsMonth,
                },
            },
        });
    } catch (error) {
        console.error('Get rider me error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch profile', message: error.message });
    }
};

// ============ UPLOAD DOCUMENT ============
export const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No document file provided' });
        }

        const { document_type } = req.body;
        const validTypes = ['DRIVERS_LICENSE', 'ID_PROOF', 'VEHICLE_REGISTRATION', 'PHOTO'];

        if (!document_type || !validTypes.includes(document_type)) {
            return res.status(400).json({
                success: false,
                error: `document_type is required and must be one of: ${validTypes.join(', ')} `
            });
        }

        // Get rider profile
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) {
            return res.status(404).json({ success: false, error: 'Rider profile not found' });
        }

        // Check if document already exists and is not rejected
        const existingDoc = await prisma.rider_documents.findUnique({
            where: { rider_id_document_type: { rider_id: rider.id, document_type } }
        });

        if (existingDoc && existingDoc.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'This document is already approved' });
        }

        // Upload to Cloudinary
        const result = await uploadToCloudinary(
            req.file.buffer,
            'rider-documents',
            req.file.mimetype,
        );

        if (!result.success) {
            return res.status(500).json({ success: false, error: 'Failed to upload document' });
        }

        // Upsert (create or update rejected doc)
        const doc = await prisma.rider_documents.upsert({
            where: { rider_id_document_type: { rider_id: rider.id, document_type } },
            create: {
                rider_id: rider.id,
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

        // Set rider status to PENDING_VERIFICATION if currently ACTION_REQUIRED
        if (rider.verification_status === 'ACTION_REQUIRED') {
            // Check if all rejected docs are now re-uploaded
            const allDocs = await prisma.rider_documents.findMany({ where: { rider_id: rider.id } });
            const hasRejected = allDocs.some(d => d.status === 'REJECTED');
            if (!hasRejected) {
                await prisma.riders.update({
                    where: { id: rider.id },
                    data: { verification_status: 'PENDING_VERIFICATION', updated_at: new Date() }
                });
            }
        }

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
        console.error('Upload document error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload document', message: error.message });
    }
};

// ============ SUBMIT VERIFICATION REQUEST ============
export const submitVerificationRequest = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            include: { rider_documents: true }
        });

        if (!rider) {
            return res.status(404).json({ success: false, error: 'Rider profile not found' });
        }

        if (rider.verification_status === 'VERIFIED') {
            return res.status(400).json({ success: false, error: 'You are already verified' });
        }

        const uploadedDocs = rider.rider_documents.filter(d => d.status !== 'REJECTED');
        if (uploadedDocs.length === 0) {
            return res.status(400).json({ success: false, error: 'Please upload at least one document before submitting' });
        }

        const hasRejected = rider.rider_documents.some(d => d.status === 'REJECTED');
        if (hasRejected) {
            return res.status(400).json({ success: false, error: 'Please re-upload rejected documents before submitting' });
        }

        await prisma.riders.update({
            where: { id: rider.id },
            data: { verification_status: 'PENDING_VERIFICATION', updated_at: new Date() }
        });

        res.status(200).json({
            success: true,
            message: 'Verification request submitted successfully. We will review your documents shortly.',
        });
    } catch (error) {
        console.error('Submit verification request error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit request' });
    }
};

// ============ VERIFY RIDER TOKEN ============
export const verifyRiderToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: 'Token is required' });

        const decoded = verifyToken(token);
        if (!decoded || decoded.role !== 'RIDER') {
            return res.status(401).json({ success: false, error: 'Invalid rider token' });
        }

        res.status(200).json({ success: true, valid: true, user: decoded });
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
};

// ============ RIDER LOGOUT ============
export const logoutRider = async (req, res) => {
    try {
        res.clearCookie('token');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
};

// ============ RIDER FIREBASE PHONE AUTH ============
// Client sends Firebase idToken after completing phone OTP on client side
export const verifyRiderFirebasePhone = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, message: 'Firebase ID token is required' });
        }

        // Verify Firebase ID token
        const decoded = await admin.auth().verifyIdToken(idToken);
        const firebasePhone = decoded.phone_number;

        if (!firebasePhone) {
            return res.status(400).json({ success: false, message: 'No phone number associated with this token' });
        }

        // Remove country code from Firebase phone number (+91 or +1 etc)
        const cleanedPhone = firebasePhone.replace(/^\+\d{1,3}/, '');

        // Find or create rider user
        let user = await prisma.users.findFirst({
            where: { phone: cleanedPhone, role: 'RIDER' },
            include: { riders: true },
        });

        if (!user) {
            // Auto-create rider on first phone login
            const result = await prisma.$transaction(async (tx) => {
                const newUser = await tx.users.create({
                    data: {
                        phone: cleanedPhone,
                        email: `rider_${cleanedPhone.replace(/\D/g, '')}@riders.local`,
                        name: `Rider ${cleanedPhone}`,
                        role: 'RIDER',
                        is_active: true,
                    }
                });

                const newRider = await tx.riders.create({
                    data: {
                        user_id: newUser.id,
                        verification_status: 'PENDING_VERIFICATION',
                    }
                });

                return { ...newUser, riders: newRider };
            });
            user = result;
        }

        // Update last login
        await prisma.users.update({
            where: { id: user.id },
            data: { last_login: new Date() }
        });

        const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            phone: user.phone,
            rider_id: user.riders?.id,
        });

        res.json({
            success: true,
            message: 'Phone verified',
            token,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                role: user.role,
                rider_id: user.riders?.id,
                verification_status: user.riders?.verification_status,
            },
        });
    } catch (err) {
        console.error('Firebase Phone Verify Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
