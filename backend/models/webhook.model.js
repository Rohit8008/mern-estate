import mongoose from 'mongoose';

/**
 * Outbound webhooks: the workspace's own subscriptions to its events.
 *
 * This is what lets an agency wire the CRM to Zapier, Make, n8n or their own
 * script without the vendor building an integration for each one.
 */

/**
 * The events a workspace can subscribe to.
 *
 * A closed catalogue, for the same reason permissions and notifications are
 * one: a subscription is stored config, so an event name is a contract. Adding
 * one is an edit here; renaming one silently breaks every customer's automation.
 */
export const WEBHOOK_EVENTS = Object.freeze({
  'lead.created': 'A lead or client was created',
  'lead.updated': 'A lead was changed',
  'lead.assigned': 'A lead was assigned to an agent',
  'lead.deleted': 'A lead was deleted',
  'deal.created': 'A deal was added',
  'deal.stage_changed': 'A deal moved to a new stage',
  'listing.created': 'A property was added',
  'listing.updated': 'A property was changed',
  'task.created': 'A task was created',
  'task.completed': 'A task was completed',
  'buyer.created': 'A buyer requirement was added',
  'share.viewed': 'Someone opened a share link',
});

export const WEBHOOK_EVENT_NAMES = Object.freeze(Object.keys(WEBHOOK_EVENTS));

const webhookSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },

    /**
     * Event names, or `*` for everything.
     *
     * `*` is stored as-is rather than expanded, so a workspace subscribed to
     * everything keeps receiving new event types as they are added instead of
     * silently missing them.
     */
    events: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.every((e) => e === '*' || WEBHOOK_EVENT_NAMES.includes(e)),
        message: 'Unknown event name',
      },
    },

    /**
     * The shared secret used to sign each delivery.
     *
     * Stored in the clear on purpose: the receiver needs the same value to
     * verify, so an admin has to be able to read it back off the screen. It is
     * a signing key, not a credential to anything of ours.
     */
    secret: { type: String, required: true, maxlength: 200 },

    isActive: { type: Boolean, default: true, index: true },

    /**
     * Consecutive failures. Reset on any success; at the threshold the hook
     * disables itself, so a dead endpoint stops costing a retry storm forever.
     */
    failureCount: { type: Number, default: 0 },
    lastStatus: { type: Number, default: null },
    lastError: { type: String, default: '', maxlength: 500 },
    lastSuccessAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    disabledReason: { type: String, default: '', maxlength: 200 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

webhookSchema.index({ tenantId: 1, isActive: 1 });

webhookSchema.methods.subscribesTo = function subscribesTo(event) {
  return this.events.includes('*') || this.events.includes(event);
};

const Webhook = mongoose.model('Webhook', webhookSchema);
export default Webhook;
