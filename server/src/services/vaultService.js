const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Vault Service
 * 
 * Pure ciphertext CRUD — the server is a "dumb store."
 * 
 * Key design decision: The server NEVER processes, indexes, or searches
 * the encrypted data. All search/filter operations happen client-side
 * after decryption. The server only:
 * - Stores encrypted blobs (ciphertext + IV + auth tag)
 * - Associates them with a userId
 * - Stores plaintext category for basic filtering (metadata trade-off)
 * - Stores plaintext URL for future browser extension matching
 */

// ─── CREATE ──────────────────────────────────────────────

const createEntry = async (userId, { encryptedData, iv, tag, category, url }) => {
  const entry = await prisma.vaultEntry.create({
    data: {
      userId,
      encryptedData,
      iv,
      tag,
      category: category || 'general',
      url: url || null,
    },
  });

  return entry;
};

// ─── READ ALL ────────────────────────────────────────────

const getEntries = async (userId, category) => {
  const where = { userId };

  if (category && category !== 'all') {
    where.category = category;
  }

  const entries = await prisma.vaultEntry.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      encryptedData: true,
      iv: true,
      tag: true,
      category: true,
      url: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return entries;
};

// ─── READ ONE ────────────────────────────────────────────

const getEntry = async (userId, entryId) => {
  const entry = await prisma.vaultEntry.findFirst({
    where: { id: entryId, userId },
  });

  if (!entry) {
    throw new Error('Entry not found');
  }

  return entry;
};

// ─── UPDATE ──────────────────────────────────────────────

const updateEntry = async (userId, entryId, { encryptedData, iv, tag, category, url }) => {
  // Verify ownership first
  const existing = await prisma.vaultEntry.findFirst({
    where: { id: entryId, userId },
  });

  if (!existing) {
    throw new Error('Entry not found');
  }

  const updated = await prisma.vaultEntry.update({
    where: { id: entryId },
    data: {
      encryptedData,
      iv,
      tag,
      category: category || existing.category,
      url: url !== undefined ? url : existing.url,
    },
  });

  return updated;
};

// ─── DELETE ──────────────────────────────────────────────

const deleteEntry = async (userId, entryId) => {
  const existing = await prisma.vaultEntry.findFirst({
    where: { id: entryId, userId },
  });

  if (!existing) {
    throw new Error('Entry not found');
  }

  await prisma.vaultEntry.delete({ where: { id: entryId } });

  return { message: 'Entry deleted' };
};

// ─── BULK RE-ENCRYPT ─────────────────────────────────────
// Used when master password is changed — client re-encrypts all entries
// with new Key B and sends them all back

const bulkUpdateEntries = async (userId, entries) => {
  const operations = entries.map((entry) =>
    prisma.vaultEntry.update({
      where: { id: entry.id },
      data: {
        encryptedData: entry.encryptedData,
        iv: entry.iv,
        tag: entry.tag,
      },
    })
  );

  // Verify all entries belong to this user first
  const userEntryIds = await prisma.vaultEntry.findMany({
    where: { userId },
    select: { id: true },
  });
  const validIds = new Set(userEntryIds.map((e) => e.id));

  for (const entry of entries) {
    if (!validIds.has(entry.id)) {
      throw new Error('Unauthorized: entry does not belong to this user');
    }
  }

  await prisma.$transaction(operations);

  return { message: `${entries.length} entries re-encrypted` };
};

module.exports = {
  createEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  bulkUpdateEntries,
};
