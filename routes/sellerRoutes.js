import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import {
    getSellerProducts,
    searchMasterProducts,
    requestNewProduct,
    addProductStock,
    updateOfferPrice,
    getNegotiations,
    acceptCounterOffer,
    declineCounterOffer,
    getDivisionWarehouses,
    getWarehousePincodes,
    allocateWarehouse,
    getSellerOrders,
    getOrderDetails,
    getSellerDashboard,
    getSellerEarnings,
    requestWalletWithdrawal,
    toggleStoreStatus
} from '../controller/sellerController.js';

const router = express.Router();

// All seller routes require authentication + seller/vendor role
const requireSeller = requireRole('SELLER', 'VENDOR');

// Dashboard
router.get('/dashboard', authenticateToken, requireSeller, getSellerDashboard);
router.get('/earnings', authenticateToken, requireSeller, getSellerEarnings);

// Product management
router.get('/products', authenticateToken, requireSeller, getSellerProducts);
router.get('/products/search', authenticateToken, requireSeller, searchMasterProducts);
router.post('/products/request', authenticateToken, requireSeller, requestNewProduct);
router.post('/products/stock', authenticateToken, requireSeller, addProductStock);
router.patch('/products/:id/offer-price', authenticateToken, requireSeller, updateOfferPrice);

// Store open/close toggle
router.post('/toggle-store', authenticateToken, requireSeller, toggleStoreStatus);

// Negotiation management
router.get('/negotiations', authenticateToken, requireSeller, getNegotiations);
router.post('/negotiations/:id/accept', authenticateToken, requireSeller, acceptCounterOffer);
router.post('/negotiations/:id/decline', authenticateToken, requireSeller, declineCounterOffer);

// Warehouse Allocation APIs
router.get('/warehouses/division', authenticateToken, requireSeller, getDivisionWarehouses);
router.get('/warehouses/:warehouseId/pincodes', authenticateToken, requireSeller, getWarehousePincodes);
router.post('/warehouse-allocation', authenticateToken, requireSeller, allocateWarehouse);

// Order management
router.get('/orders', authenticateToken, requireSeller, getSellerOrders);
router.get('/orders/:id', authenticateToken, requireSeller, getOrderDetails);

// Wallet management
router.post('/wallet/withdraw', authenticateToken, requireSeller, requestWalletWithdrawal);

export default router;
