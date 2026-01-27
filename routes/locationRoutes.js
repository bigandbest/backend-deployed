import express from 'express';
import {
  getPincodeDetails,
  calculateShipping,
  calculateTax,
  searchLocation
} from '../controller/locationController.js';

const router = express.Router();

// Search location (Proxy to OpenStreetMap)
router.get('/search', searchLocation);

// Get pincode details
router.get('/pincode/:pincode', getPincodeDetails);

// Calculate shipping charges
router.post('/shipping/calculate', calculateShipping);

// Calculate tax
router.post('/tax/calculate', calculateTax);

export default router;