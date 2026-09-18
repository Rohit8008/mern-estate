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

const Message = mongoose.model('Message', messageSchema);

export default Message;


