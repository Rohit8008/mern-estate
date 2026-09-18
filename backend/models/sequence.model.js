import mongoose from 'mongoose';

/**
 * A multi-step follow-up sequence.
 *
 * Following up was entirely manual: a `communications[]` entry after the fact
 * and a `followUps[]` reminder someone had to set by hand, one at a time. So
 * "call, then email in three days, then call again a week later" was a thing
 * agents did from memory, and stopped doing when they got busy.
 *
 * Steps are stored in order with a delay from the previous one, rather than
 * with absolute dates, so a sequence can be enrolled at any time and a step
 * added in the middle does not require rewriting every enrollment.
 */

/** What a step does when it comes due. */
export const STEP_ACTIONS = Object.freeze({
  task: 'Create a task for the lead’s owner',
  email: 'Send an email to the lead',
  reminder: 'Remind the owner to make contact',
});

export const STEP_ACTION_NAMES = Object.freeze(Object.keys(STEP_ACTIONS));

const stepSchema = new mongoose.Schema(
  {
    action: { type: String, enum: STEP_ACTION_NAMES, required: true },

    /** Days after the previous step (or after enrollment, for the first). */
    delayDays: { type: Number, default: 1, min: 0, max: 365 },

    subject: { type: String, default: '', maxlength: 200 },

    /**
     * The message. Supports the same `{{name}}` merge fields the email
     * templates use, resolved against the lead.
     */
    body: { type: String, default: '', maxlength: 5000 },
  },
  { _id: true }
);

const sequenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    steps: { type: [stepSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

sequenceSchema.index({ tenantId: 1, isActive: 1 });

/** Total calendar days from enrollment to the last step. */
sequenceSchema.virtual('totalDays').get(function totalDays() {
  return (this.steps || []).reduce((sum, step) => sum + (step.delayDays || 0), 0);
});

const Sequence = mongoose.model('Sequence', sequenceSchema);
export default Sequence;
