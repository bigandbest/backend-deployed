import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import { generateToken, verifyToken } from '../utils/jwtUtils.js';
import admin from '../config/firebase.js';

/**
 * Seller Registration
 */
export const registerSeller = async (req, res) => {
    try {
        const { email, password, name, phone, role, business_name, business_type, gstin, pan, address, city, state, pincode } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ success: false, error: 'Email, password, and name are required' });
        }

        const sellerRole = (role === 'VENDOR') ? 'VENDOR' : 'SELLER';

        // Check if user exists
        const existingUser = await prisma.users.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user + seller profile in transaction
        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.users.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    phone,
                    role: sellerRole,
                    is_active: true,
                }
            });

            const seller = await tx.sellers.create({
                data: {
                    user_id: user.id,
                    business_name: business_name || name,
                    business_type,
                    seller_type: sellerRole,
                    gstin,
                    pan,
                    address,
                    city,
                    state,
                    pincode,
                }
            });

            return { user, seller };
        });

        // Generate token
        const token = generateToken({
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            name: result.user.name,
            seller_id: result.seller.id,
        });

        res.status(201).json({
            success: true,
            token,
            data: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                seller_id: result.seller.id,
                seller_type: result.seller.seller_type,
            },
            message: 'Seller registered successfully',
        });
    } catch (error) {
        console.error('Seller registration error:', error);
        res.status(500).json({ success: false, error: 'Registration failed', message: error.message });
    }
};

/**
 * Seller Login
 */
export const loginSeller = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        // Find user
        const user = await prisma.users.findUnique({
            where: { email },
            include: { sellers: true }
        });

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check role
        if (!['SELLER', 'VENDOR'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'You do not have seller access' });
        }

        // Verify password
        if (!user.password) {
            return res.status(401).json({ success: false, error: 'Account not set up for password login' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if active
        if (user.is_active === false) {
            return res.status(403).json({ success: false, error: 'Account is deactivated' });
        }

        // Update last login
        await prisma.users.update({
            where: { id: user.id },
            data: { last_login: new Date() }
        });

        // Generate token
        const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            seller_id: user.sellers?.id,
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
                seller_id: user.sellers?.id,
                seller_type: user.sellers?.seller_type,
                business_name: user.sellers?.business_name,
                is_verified: user.sellers?.is_verified,
            },
        });
    } catch (error) {
        console.error('Seller login error:', error);
        res.status(500).json({ success: false, error: 'Login failed', message: error.message });
    }
};

/**
 * Get current seller profile
 */
export const getSellerMe = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const user = await prisma.users.findUnique({
            where: { id: req.user.id },
            include: {
                sellers: {
                    include: {
                        warehouse_sellers: {
                            include: {
                                warehouses: true
                            }
                        },
                        seller_documents: true
                    }
                }
            }
        });

        if (!user || !['SELLER', 'VENDOR'].includes(user.role)) {
            return res.status(404).json({ success: false, error: 'Seller not found' });
        }

        let activePincodesCount = 0;
        if (user.sellers) {
            const requests = await prisma.seller_pincode_requests.findMany({
                where: { seller_id: user.sellers.id, status: 'APPROVED' }
            });
            let allPins = new Set();
            if (user.sellers.pincode) {
                user.sellers.pincode.split(',').forEach(p => p.trim() && allPins.add(p.trim()));
            }
            requests.forEach(r => allPins.add(r.pincode));
            activePincodesCount = allPins.size;
        }

        res.status(200).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar || user.photo_url,
                seller_id: user.sellers?.id,
                seller_type: user.sellers?.seller_type,
                business_name: user.sellers?.business_name,
                business_type: user.sellers?.business_type,
                address: user.sellers?.address,
                city: user.sellers?.city,
                state: user.sellers?.state,
                pincode: user.sellers?.pincode,
                is_verified: user.sellers?.is_verified,
                is_active: user.sellers?.is_active,
                is_open: user.sellers?.is_open,
                verification_status: user.sellers?.verification_status,
                activePincodes: activePincodesCount,
                gstin: user.sellers?.gstin,
                pan: user.sellers?.pan,
                bank_account_no: user.sellers?.bank_account_no,
                bank_ifsc: user.sellers?.bank_ifsc,
                bank_name: user.sellers?.bank_name,
                documents: user.sellers?.seller_documents?.map(d => ({
                    id: d.id,
                    type: d.document_type,
                    url: d.document_url,
                    status: d.status,
                    rejection_reason: d.rejection_reason,
                })) || [],
                warehouses: user.sellers?.warehouse_sellers?.map(ws => ({
                    id: ws.warehouses.id,
                    name: ws.warehouses.name,
                    type: ws.warehouses.type,
                })) || [],
            },
        });
    } catch (error) {
        console.error('Get seller me error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch profile', message: error.message });
    }
};

/**
 * Update Seller Business Profile
 */
export const updateSellerProfile = async (req, res) => {
    try {
        const { business_name, business_type, address, city, state, pincode, phone, email } = req.body;

        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        // Update User info if provided
        if (phone || email) {
            await prisma.users.update({
                where: { id: req.user.id },
                data: {
                    ...(phone && { phone }),
                    ...(email && { email }),
                }
            });
        }

        // Update Seller info
        const updatedSeller = await prisma.sellers.update({
            where: { id: seller.id },
            data: {
                ...(business_name && { business_name }),
                ...(business_type && { business_type }),
                ...(address && { address }),
                ...(city && { city }),
                ...(state && { state }),
                ...(pincode && { pincode }),
            }
        });

        res.status(200).json({ success: true, data: updatedSeller, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
};

/**
 * Update Seller KYC (GSTIN, PAN)
 */
export const updateSellerKyc = async (req, res) => {
    try {
        const { gstin, pan } = req.body;

        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        // Ensure these match in users table too if necessary
        await prisma.users.update({
            where: { id: req.user.id },
            data: {
                ...(gstin && { gstin }),
                ...(pan && { pan }),
            }
        });

        const updatedSeller = await prisma.sellers.update({
            where: { id: seller.id },
            data: {
                ...(gstin && { gstin }),
                ...(pan && { pan }),
            }
        });

        res.status(200).json({ success: true, data: updatedSeller, message: 'KYC Details updated successfully' });
    } catch (error) {
        console.error('Update KYC error:', error);
        res.status(500).json({ success: false, error: 'Failed to update KYC details' });
    }
};

/**
 * Update Seller Bank Details
 */
export const updateSellerBankDetails = async (req, res) => {
    try {
        const { bank_account_no, bank_ifsc, bank_name } = req.body;

        const seller = await prisma.sellers.findUnique({ where: { user_id: req.user.id } });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller profile not found' });

        const updatedSeller = await prisma.sellers.update({
            where: { id: seller.id },
            data: {
                ...(bank_account_no && { bank_account_no }),
                ...(bank_ifsc && { bank_ifsc }),
                ...(bank_name && { bank_name }),
            }
        });

        res.status(200).json({ success: true, data: updatedSeller, message: 'Bank details updated successfully' });
    } catch (error) {
        console.error('Update bank error:', error);
        res.status(500).json({ success: false, error: 'Failed to update bank details' });
    }
};

/**
 * Seller Logout
 */
export const logoutSeller = async (req, res) => {
    try {
        res.clearCookie('token');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
};

/**
 * Verify seller token
 */
export const verifySellerToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, error: 'Token is required' });
        }

        const decoded = verifyToken(token);
        if (!decoded || !['SELLER', 'VENDOR'].includes(decoded.role)) {
            return res.status(401).json({ success: false, error: 'Invalid seller token' });
        }

        res.status(200).json({ success: true, valid: true, user: decoded });
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
};

// ============ SELLER FIREBASE PHONE AUTH ============
// Client sends Firebase idToken after completing phone OTP on client side
export const verifySellerFirebasePhone = async (req, res) => {
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

        // Find seller user by phone - must have existing seller account
        const user = await prisma.users.findFirst({
            where: { phone: cleanedPhone, role: { in: ['SELLER', 'VENDOR'] } },
            include: { sellers: true },
        });

        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'No seller account found for this phone number. Please register with email first.'
            });
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
            seller_id: user.sellers?.id,
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
                seller_id: user.sellers?.id,
                seller_type: user.sellers?.seller_type,
            },
        });
    } catch (err) {
        console.error('Firebase Phone Verify Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
