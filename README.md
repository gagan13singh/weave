# 🔗 Weave

A **zero-knowledge encrypted password vault** where the server never sees your passwords. Client-side encryption using Argon2id key derivation and AES-256-GCM ensures that only you can access your credentials.

## ✨ Features

- **Zero-Knowledge Architecture** — Your master password and encryption key never leave the browser
- **AES-256-GCM Encryption** — Military-grade authenticated encryption for all vault data
- **Argon2id Key Derivation** — Memory-hard KDF resistant to GPU/ASIC brute-force attacks
- **Two-Factor Authentication** — TOTP-based 2FA (Google Authenticator, Authy compatible)
- **Recovery Key** — Optional offline recovery key generated at signup
- **Password Strength Analysis** — Real-time strength scoring with zxcvbn
- **Reused Password Detection** — Warns you when passwords are reused across accounts
- **Password Generator** — Cryptographically secure random password generation
- **Clipboard Auto-Clear** — Copied passwords auto-clear from clipboard after 30 seconds
- **Email Verification** — Secure signup flow with email confirmation
- **Rate Limiting & Account Lockout** — Brute-force protection at both IP and account level

## 🏗️ Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│   React SPA (Vite)   │  API   │   Express.js API     │
│   ──────────────     │───────▶│   ──────────────     │
│   • Argon2id KDF     │  HTTPS │   • JWT Auth         │
│   • AES-256-GCM      │        │   • bcrypt verify    │
│   • Key B in memory  │        │   • TOTP 2FA         │
│   • All crypto here  │        │   • Ciphertext CRUD  │
│                      │        │   • Rate limiting    │
│   Vercel             │        │   Railway            │
└──────────────────────┘        └──────────┬───────────┘
                                           │
                                    ┌──────▼──────┐
                                    │  Supabase   │
                                    │  PostgreSQL │
                                    │  ──────     │
                                    │  Encrypted  │
                                    │  blobs only │
                                    └─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (or Supabase account)
- npm

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/weave.git
cd weave

# Install server dependencies
cd server
npm install
cp .env.example .env  # Fill in your values

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Environment

Edit `server/.env`:

```env
DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
JWT_ACCESS_SECRET="<generate-with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\">"
JWT_REFRESH_SECRET="<generate-another-one>"
RESEND_API_KEY="re_your_key"
CLIENT_URL="http://localhost:5173"
```

### 3. Setup Database

```bash
cd server
npx prisma db push
npx prisma generate
```

### 4. Run Development Servers

```bash
# Terminal 1 — API server
cd server
npm run dev

# Terminal 2 — React client
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

## 🔒 Security Model

| Layer | Protection |
|---|---|
| Master Password | Never transmitted — only Argon2id-derived keys leave the browser |
| Key A (Auth) | SHA-256 hashed client-side → bcrypted server-side → stored |
| Key B (Encryption) | Never leaves browser memory — not in localStorage, not in cookies |
| Vault Data | AES-256-GCM encrypted client-side before any API call |
| Sessions | 15-min access JWTs + 7-day rotated refresh tokens |
| 2FA | TOTP (RFC 6238) — requires authenticator app on every login |
| Rate Limiting | 5 login attempts/15min (IP) + 10 failed attempts = 30min lockout (account) |
| Recovery | 256-bit recovery key shown once at signup — encrypts Key B for future recovery |

## 📁 Project Structure

```
weave/
├── client/          # React + Vite frontend (deployed to Vercel)
│   ├── src/
│   │   ├── lib/     # crypto.js, api.js, validators.js
│   │   ├── context/ # AuthContext, VaultContext
│   │   ├── pages/   # Login, Signup, Dashboard, Settings, RecoverAccount
│   │   └── hooks/   # useClipboard
│   └── vercel.json
│
├── server/          # Express API (deployed to Railway)
│   ├── prisma/      # Database schema
│   └── src/
│       ├── middleware/  # auth, rateLimiter, security (helmet/CORS)
│       ├── routes/      # auth, vault
│       ├── controllers/ # HTTP handlers
│       ├── services/    # Business logic (auth, vault, email)
│       └── utils/       # JWT tokens, TOTP
│
└── ARCHITECTURE_DEEP_DIVE.md  # Detailed technical docs (gitignored)
```

## 🛣️ Roadmap

- [x] Phase 1: Security Foundation (Argon2id, AES-256-GCM, JWT, 2FA)
- [x] Phase 2: Core Vault UI (CRUD, search, categories, password strength)
- [ ] Phase 3: Recovery-Chain Graph (D3.js visualization)
- [ ] Phase 4: AI Discovery Agent (Gmail/Outlook OAuth scanning)
- [ ] Phase 5: Hardening & Audit (pen testing, HaveIBeenPwned)
- [ ] Future: Browser Extension (autofill like Google Passwords)

## 📄 License

MIT
