import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    saveAddress,
    listAddresses,
    updateAddress,
    deleteAddress,
    setDefault,
} from '../controller/customerAddressController.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', listAddresses);
router.post('/', saveAddress);
router.patch('/:id', updateAddress);
router.delete('/:id', deleteAddress);
router.post('/:id/default', setDefault);

export default router;
