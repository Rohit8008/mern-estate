import mongoose from 'mongoose';

/**
 * A personal calendar entry: a meeting, a site visit, anything that is not a
 * task or a follow-up. These used to live only in the browser's localStorage,
 * so they vanished on another device or after clearing site data.
 *
 * `date` and `time` are kept as the strings the user picked (YYYY-MM-DD, HH:mm)
 * because they are wall-clock times in the agent's own day; converting them to
 * an instant would move them when viewed from another timezone.
 */
const calendarEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, default: '09:00', match: /^\d{2}:\d{2}$/ },
    reminderMinutes: { type: Number, default: 15, min: 0, max: 10080 },
  },
  { timestamps: true }
);

calendarEventSchema.index({ tenantId: 1, user: 1, date: 1 });

export default mongoose.models.CalendarEvent || mongoose.model('CalendarEvent', calendarEventSchema);
