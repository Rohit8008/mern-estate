import mongoose from 'mongoose';

/**
 * One lead's progress through one sequence.
 *
 * Kept as its own collection rather than an array on the Client so that the job
 * which fires due steps can query "what is due now?" directly, instead of
 * scanning every lead in the workspace every few minutes.
 */
const enrollmentSchema = new mongoose.Schema(
  {
    sequence: { type: mongoose.Schema.Types.ObjectId, ref: 'Sequence', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },

    /** Index of the next step to fire. Equals steps.length once finished. */
    currentStep: { type: Number, default: 0 },

    /** When that step becomes due. The job's whole query is built on this. */
    nextStepAt: { type: Date, default: () => new Date(), index: true },

    status: {
      type: String,
      enum: ['active', 'completed', 'stopped'],
      default: 'active',
      index: true,
    },

    /** Why it stopped, when it was not simply finished. */
    stoppedReason: { type: String, default: '', maxlength: 200 },

    history: [
      new mongoose.Schema(
        {
          stepIndex: { type: Number, required: true },
          action: { type: String, required: true, maxlength: 40 },
          firedAt: { type: Date, default: Date.now },
          outcome: { type: String, default: '', maxlength: 200 },
        },
        { _id: false }
      ),
    ],

    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// The claim query: active enrollments whose next step is due.
enrollmentSchema.index({ tenantId: 1, status: 1, nextStepAt: 1 });

// A lead is only ever on a given sequence once at a time.
enrollmentSchema.index({ tenantId: 1, sequence: 1, client: 1 }, { unique: true });

const SequenceEnrollment = mongoose.model('SequenceEnrollment', enrollmentSchema);
export default SequenceEnrollment;
