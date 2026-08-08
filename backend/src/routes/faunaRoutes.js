const express = require('express');
const faunaController = require('../controllers/faunaController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Hotspots must be registered before '/:id' so 'hotspots' is not matched as an id.
router.get('/hotspots', protect, restrictTo('field_officer', 'manager'), faunaController.getHotspots);
router.get('/hotspots/:block/sightings', protect, restrictTo('field_officer', 'manager'), faunaController.getBlockSightings);
router.get('/hotspots/:block/summary', protect, restrictTo('field_officer', 'manager'), faunaController.getBlockSummary);
router.post('/hotspots/:block/alert-draft', protect, restrictTo('field_officer', 'manager'), faunaController.getBlockAlertDraft);
router.post('/hotspots/:block/alert-send', protect, restrictTo('field_officer', 'manager'), faunaController.sendBlockAlert);

// Welfare Partners get read + create; the controller scopes them to their
// assigned blocks. Status updates and deletes stay internal-only.
router.get('/', protect, restrictTo('field_officer', 'manager', 'welfare_partner'), faunaController.listSightings);
router.post('/', protect, restrictTo('field_officer', 'manager', 'welfare_partner'), faunaController.createSighting);
router.get('/:id', protect, restrictTo('field_officer', 'manager', 'welfare_partner'), faunaController.getSighting);
router.patch('/:id/status', protect, restrictTo('field_officer', 'manager'), faunaController.updateStatus);
router.delete('/:id', protect, restrictTo('manager'), faunaController.softDeleteSighting);

module.exports = router;
