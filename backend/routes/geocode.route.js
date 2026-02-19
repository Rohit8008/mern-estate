import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { searchAddress, reverseGeocode } from '../controllers/geocode.controller.js';

const router = express.Router();

router.get('/search', verifyToken, searchAddress);
router.get('/reverse', verifyToken, reverseGeocode);

export default router;
