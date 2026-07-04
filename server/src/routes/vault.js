const express = require('express');
const router = express.Router();
const vaultController = require('../controllers/vaultController');
const { authenticate } = require('../middleware/auth');

/**
 * Vault Routes
 * 
 * All routes are protected — require valid JWT.
 * The server handles only ciphertext — never plaintext credentials.
 * 
 * GET    /           → List all encrypted entries (optional ?category= filter)
 * POST   /           → Create new encrypted entry
 * GET    /:id        → Get single encrypted entry
 * PUT    /:id        → Update encrypted entry
 * DELETE /:id        → Delete entry
 * PUT    /bulk/update → Re-encrypt all entries (for master password change)
 */

router.use(authenticate); // All vault routes require auth

router.get('/', vaultController.getEntries);
router.post('/', vaultController.createEntry);
router.get('/:id', vaultController.getEntry);
router.put('/bulk/update', vaultController.bulkUpdate);
router.put('/:id', vaultController.updateEntry);
router.delete('/:id', vaultController.deleteEntry);

module.exports = router;
