const express = require('express');
const reportController = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, reportController.createReport);
router.get('/', protect, reportController.listReports);
router.get('/:id', protect, reportController.getReport);
router.patch('/:id/status', protect, restrictTo('field_officer', 'manager'), reportController.updateStatus);
router.delete('/:id', protect, restrictTo('manager'), reportController.softDeleteReport);

module.exports = router;
