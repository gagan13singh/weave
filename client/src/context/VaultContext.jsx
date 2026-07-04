import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../lib/api';
import { encrypt, decrypt } from '../lib/crypto';
import { useAuthContext } from './AuthContext';
import { generatePassword } from '../lib/validators';
import toast from 'react-hot-toast';

const VaultContext = createContext(null);

export const useVaultContext = () => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVaultContext must be used within VaultProvider');
  return ctx;
};

export const VaultProvider = ({ children }) => {
  const { keyB, user } = useAuthContext();
  const [entries, setEntries] = useState([]);
  const [decryptedEntries, setDecryptedEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');


  // ─── FETCH & DECRYPT ──────────────────────────────────

  const fetchEntries = useCallback(async () => {
    if (!keyB || !user) return;

    setLoading(true);
    try {
      const { data } = await api.get('/vault', {
        params: activeCategory !== 'all' ? { category: activeCategory } : {},
      });

      setEntries(data);

      // Decrypt all entries client-side
      const decrypted = await Promise.all(
        data.map(async (entry) => {
          try {
            const plaintext = await decrypt(entry.encryptedData, entry.iv, entry.tag, keyB);
            return {
              id: entry.id,
              category: entry.category,
              url: entry.url,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
              ...plaintext, // serviceName, username, password, notes, recoveryEmail, recoveryPhone
            };
          } catch (err) {
            console.error('Failed to decrypt entry:', entry.id, err);
            return {
              id: entry.id,
              category: entry.category,
              serviceName: '⚠️ Decryption failed',
              username: '',
              password: '',
              _decryptionFailed: true,
            };
          }
        })
      );

      setDecryptedEntries(decrypted);
    } catch (error) {
      console.error('Failed to fetch vault entries:', error);
    } finally {
      setLoading(false);
    }
  }, [keyB, user, activeCategory]);



  // ─── CREATE ────────────────────────────────────────────

  const createEntry = useCallback(async (entryData) => {
    if (!keyB) throw new Error('Vault is locked');

    const { category, url, ...plaintextData } = entryData;

    // Encrypt on client side
    const { ciphertext, iv, tag } = await encrypt(plaintextData, keyB);

    const { data } = await api.post('/vault', {
      encryptedData: ciphertext,
      iv,
      tag,
      category: category || 'general',
      url: url || null,
    });

    await fetchEntries(); // Refresh list
    return data;
  }, [keyB, fetchEntries]);

  // Fetch entries when keyB becomes available or category changes & auto-provision if pending
  useEffect(() => {
    const handlePendingSocialProvision = async () => {
      const pending = sessionStorage.getItem('pending_social_provision');
      if (pending && keyB) {
        sessionStorage.removeItem('pending_social_provision');
        try {
          const { provider, email } = JSON.parse(pending);
          const serviceName = provider.charAt(0).toUpperCase() + provider.slice(1) + ' Account';
          const defaultPassword = generatePassword(20);
          
          await createEntry({
            serviceName,
            username: email,
            password: defaultPassword,
            url: `https://${provider}.com`,
            category: 'general',
            notes: `Auto-provisioned credential created during SSO signup with ${provider}.`
          });
          toast.success(`Successfully saved your ${provider} credentials in Weave!`);
        } catch (err) {
          console.error('Failed to auto-provision social credential:', err);
        }
      }
    };

    if (keyB && user) {
      fetchEntries().then(() => {
        handlePendingSocialProvision();
      });
    }
  }, [keyB, user, activeCategory, fetchEntries, createEntry]);

  // ─── UPDATE ────────────────────────────────────────────

  const updateEntry = useCallback(async (entryId, entryData) => {
    if (!keyB) throw new Error('Vault is locked');

    const { category, url, ...plaintextData } = entryData;

    const { ciphertext, iv, tag } = await encrypt(plaintextData, keyB);

    const { data } = await api.put(`/vault/${entryId}`, {
      encryptedData: ciphertext,
      iv,
      tag,
      category: category || 'general',
      url: url || undefined,
    });

    await fetchEntries();
    return data;
  }, [keyB, fetchEntries]);

  // ─── DELETE ────────────────────────────────────────────

  const deleteEntry = useCallback(async (entryId) => {
    await api.delete(`/vault/${entryId}`);
    await fetchEntries();
  }, [fetchEntries]);

  // ─── SEARCH (client-side) ──────────────────────────────

  const filteredEntries = decryptedEntries.filter((entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.serviceName?.toLowerCase().includes(q) ||
      entry.username?.toLowerCase().includes(q) ||
      entry.notes?.toLowerCase().includes(q) ||
      entry.url?.toLowerCase().includes(q)
    );
  });

  // ─── CATEGORIES ────────────────────────────────────────

  const categories = [
    { id: 'all', label: 'All', icon: '🔐' },
    { id: 'general', label: 'General', icon: '📁' },
    { id: 'work', label: 'Work', icon: '💼' },
    { id: 'personal', label: 'Personal', icon: '👤' },
    { id: 'banking', label: 'Banking', icon: '🏦' },
    { id: 'social', label: 'Social', icon: '💬' },
    { id: 'development', label: 'Dev', icon: '💻' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  ];

  const categoryCounts = categories.reduce((acc, cat) => {
    if (cat.id === 'all') {
      acc[cat.id] = decryptedEntries.length;
    } else {
      acc[cat.id] = decryptedEntries.filter((e) => e.category === cat.id).length;
    }
    return acc;
  }, {});

  const value = {
    entries: filteredEntries,
    allEntries: decryptedEntries,
    rawEntries: entries,
    loading,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    categories,
    categoryCounts,
    createEntry,
    updateEntry,
    deleteEntry,
    fetchEntries,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
};
