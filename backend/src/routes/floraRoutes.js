const express = require('express');
const router = express.Router();
const floraController = require('../controllers/floraController');

// Main endpoints for Flora Management
router.get('/', floraController.getAllGreenery);       // Fetch plant directory
router.post('/', floraController.createGreenery);      // Create manual record
router.post('/bulk', floraController.bulkUploadCSV);   // Bulk import spreadsheet hook

module.exports = router;