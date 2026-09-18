import mongoose from 'mongoose';

/**
 * One attempt to deliver one event to one endpoint.
 *
 * A queue in the database rather than in memory, because the process that
 * raised the event may not be the one that delivers it, and a restart must not
 * lose deliveries. It is also the delivery log an admin needs when a customer
 * says "your webhook never fired".
 */
const webhookDeliverySchema = new mongoose.Schema(
  {
    webhook: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    event: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'abandoned'],
      default: 'pending',
      index: true,
    },

    attempts: { type: Number, default: 0 },

    /** When the next attempt becomes due. Drives the retry backoff. */
    nextAttemptAt: { type: Date, default: () => new Date(), index: true },

    responseStatus: { type: Number, default: null },
    responseBody: { type: String, default: '', maxlength: 2000 },
    error: { type: String, default: '', maxlength: 500 },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The claim query: pending work that is due, oldest first.
webhookDeliverySchema.index({ tenantId: 1, status: 1, nextAttemptAt: 1 });

// Delivery history is operational, not permanent: keep 30 days.
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const WebhookDelivery = mongoose.model('WebhookDelivery', webhookDeliverySchema);
export default WebhookDelivery;
