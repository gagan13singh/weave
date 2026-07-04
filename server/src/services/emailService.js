const { Resend } = require('resend');

/**
 * Email Service
 * 
 * Uses Resend API for transactional emails.
 * Currently handles:
 * - Email verification on signup
 * 
 * Why Resend over Nodemailer/SMTP?
 * - No SMTP server to manage
 * - Better deliverability
 * - Simple API, generous free tier (100 emails/day)
 * - Works great with Vercel/Railway deployment
 */

let resend;

const getResendClient = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

/**
 * Send email verification link after signup.
 * The token is a random UUID stored in the DB with an expiry.
 */
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  try {
    const client = getResendClient();
    await client.emails.send({
      from: process.env.FROM_EMAIL || 'Weave <noreply@weave.dev>',
      to: email,
      subject: 'Verify your Weave account',
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 600; color: #f0f0f0; margin-bottom: 8px;">Weave</h1>
          <p style="color: #a0a0a0; font-size: 14px; margin-bottom: 32px;">Zero-knowledge credential vault</p>
          
          <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
            <h2 style="font-size: 18px; font-weight: 500; color: #e0e0e0; margin: 0 0 12px 0;">Verify your email</h2>
            <p style="color: #888; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Click the button below to verify your email address and activate your vault.
              This link expires in 24 hours.
            </p>
            <a href="${verificationUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #6c5ce7, #a855f7); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
              Verify Email
            </a>
          </div>
          
          <p style="color: #555; font-size: 12px; line-height: 1.5;">
            If you didn't create a Weave account, you can safely ignore this email.
            <br/>Your master password is never stored on our servers.
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Email send failed:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendVerificationEmail };
