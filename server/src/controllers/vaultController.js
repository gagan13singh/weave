const vaultService = require('../services/vaultService');

/**
 * Vault Controller
 * 
 * Handles HTTP concerns for vault CRUD operations.
 * The server is intentionally "dumb" — it stores and retrieves
 * encrypted blobs without any knowledge of their contents.
 */

const createEntry = async (req, res) => {
  try {
    const { encryptedData, iv, tag, category, url } = req.body;

    if (!encryptedData || !iv || !tag) {
      return res.status(400).json({ error: 'encryptedData, iv, and tag are required' });
    }

    const entry = await vaultService.createEntry(req.userId, {
      encryptedData,
      iv,
      tag,
      category,
      url,
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEntries = async (req, res) => {
  try {
    const { category } = req.query;
    const entries = await vaultService.getEntries(req.userId, category);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEntry = async (req, res) => {
  try {
    const entry = await vaultService.getEntry(req.userId, req.params.id);
    res.json(entry);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const updateEntry = async (req, res) => {
  try {
    const { encryptedData, iv, tag, category, url } = req.body;

    if (!encryptedData || !iv || !tag) {
      return res.status(400).json({ error: 'encryptedData, iv, and tag are required' });
    }

    const entry = await vaultService.updateEntry(req.userId, req.params.id, {
      encryptedData,
      iv,
      tag,
      category,
      url,
    });

    res.json(entry);
  } catch (error) {
    res.status(error.message === 'Entry not found' ? 404 : 500).json({ error: error.message });
  }
};

const deleteEntry = async (req, res) => {
  try {
    const result = await vaultService.deleteEntry(req.userId, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.message === 'Entry not found' ? 404 : 500).json({ error: error.message });
  }
};

const bulkUpdate = async (req, res) => {
  try {
    const { entries } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    const result = await vaultService.bulkUpdateEntries(req.userId, entries);
    res.json(result);
  } catch (error) {
    res.status(error.message.includes('Unauthorized') ? 403 : 500).json({ error: error.message });
  }
};

module.exports = {
  createEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  bulkUpdate,
};
