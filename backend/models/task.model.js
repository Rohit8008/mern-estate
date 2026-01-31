import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueAt: { type: Date, default: null, index: true },
    status: { type: String, enum: ['todo', 'in_progress', 'done', 'blocked'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    related: {
      kind: { type: String, enum: ['client', 'listing', 'none'], default: 'none' },
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
      listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
    },
    reminders: [{
      at: { type: Date, required: true },
      sent: { type: Boolean, default: false },
    }],
  },
  { timestamps: true }
);

taskSchema.index({ title: 'text', description: 'text' });

const Task = mongoose.model('Task', taskSchema);
export default Task;
