import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    content: { type: String, required: true, maxlength: 50000 },
    isEncrypted: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Inbox, thread and unread-count shapes. Tenant leads every one (see tenancy).
messageSchema.index({ tenantId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ tenantId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ tenantId: 1, receiverId: 1, read: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;


