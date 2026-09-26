import mongoose from 'mongoose';

/**
 * Addresses that must not receive automated follow-up email, per workspace.
 *
 * Keyed by the address rather than hung off the lead, because the same person
 * comes back as a new lead — a second portal enquiry, a re-import of last
 * month's spreadsheet — and a flag on the old record would not follow them. An
 * unsubscribe is a person saying stop, not a record saying stop.
 *
 * Never deleted when the lead is: the point is to remember.
 */
const emailSuppressionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    /**
     * link       — they opened the unsubscribe page from an email
     * one_click  — their mail client's Unsubscribe button (RFC 8058)
     * agent      — someone at the agency recorded it (asked on the phone, say)
     */
    source: { type: String, enum: ['link', 'one_click', 'agent'], required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Per workspace: unsubscribing from one agency says nothing about another.
emailSuppressionSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const EmailSuppression = mongoose.model('EmailSuppression', emailSuppressionSchema);

export default EmailSuppression;
