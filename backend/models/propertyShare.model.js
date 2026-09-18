import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * A link that shows chosen properties to someone without an account.
 *
 * This replaces public browsing. The catalogue is no longer open to anyone who
 * finds the URL; instead an agent decides — property by property, person by
 * person — what leaves the building. That is how the business actually works:
 * you send a buyer a shortlist, not the whole book.
 *
 * Because a share link IS the credential, everything about it is built around
 * that being true:
 *   • the token is 32 random bytes, not a guessable id
 *   • it can expire, and defaults to doing so
 *   • it can be revoked without deleting the record, so the audit survives
 *   • it never carries owner contact details, internal notes or costs
 *   • every open is counted, so an agent can see if a link has spread
 */

const propertyShareSchema = new mongoose.Schema(
  {
    /**
     * The secret in the URL. 32 bytes of CSPRNG output, url-safe.
     *
     * Long enough that guessing is not a strategy: an attacker enumerating at a
     * million tries a second would still be working through it long after the
     * agency has closed. Stored in the clear because a share link has to be
     * resolvable from the URL alone — the protection is its entropy and its
     * expiry, not secrecy at rest.
     */
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /** What the agent calls this share, so a list of links is readable. */
    label: { type: String, default: '', trim: true, maxlength: 120 },

    /**
     * The properties on show. An array because sharing a shortlist is the
     * common case — a buyer gets three options, not one.
     */
    listingIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0 && v.length <= 50,
        message: 'A share needs between 1 and 50 properties.',
      },
    },

    /** Who it was made for — a note to the agent, never shown on the page. */
    recipientName: { type: String, default: '', trim: true, maxlength: 120 },
    recipientPhone: { type: String, default: '', trim: true, maxlength: 30 },

    /**
     * Expiry. Defaults to 30 days at creation: a link that works forever is one
     * that is still working long after the deal closed and the recipient has
     * forwarded it on. An explicit `null` means no expiry, which is a choice.
     */
    expiresAt: { type: Date, default: null, index: true },

    /**
     * Revoked rather than deleted, so "who did we send this to, and when did we
     * stop it?" stays answerable.
     */
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * Optional passcode for a link going somewhere sensitive. Hashed — a share
     * link is often pasted into WhatsApp, and the database should not hold the
     * second factor in the clear either.
     */
    passcodeHash: { type: String, default: null, select: false },

    /**
     * Whether the page shows a price. Some listings are shared to gauge
     * interest before a number is agreed.
     */
    showPrice: { type: Boolean, default: true },

    /** A note from the agent, shown at the top of the shared page. */
    message: { type: String, default: '', maxlength: 1000 },

    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

propertyShareSchema.index({ createdBy: 1, createdAt: -1 });
// Expiry is checked on every open, so it wants an index alongside the token.
propertyShareSchema.index({ token: 1, revokedAt: 1, expiresAt: 1 });

/** 32 random bytes, url-safe. */
propertyShareSchema.statics.generateToken = function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
};

/** Whether this link should still open. */
propertyShareSchema.methods.isLive = function isLive() {
  if (this.revokedAt) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

/** Why it will not open, for a message the recipient can act on. */
propertyShareSchema.methods.deadReason = function deadReason() {
  if (this.revokedAt) return 'This link has been withdrawn by the agent.';
  if (this.expiresAt && this.expiresAt < new Date()) return 'This link has expired.';
  return null;
};

const PropertyShare = mongoose.model('PropertyShare', propertyShareSchema);

export default PropertyShare;
