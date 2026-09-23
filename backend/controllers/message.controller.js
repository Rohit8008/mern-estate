import mongoose from 'mongoose';
import Message from '../models/message.model.js';
import { errorHandler } from '../utils/error.js';
import { io } from '../socket.js';
import { onlineInTenant } from '../utils/onlineUsers.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';
import Listing from '../models/listing.model.js';
import { encryptMessageWithKey, decryptMessageWithKey, isEncrypted } from '../utils/encryption.js';
import { inHomeTenant } from '../tenancy/tenantContext.js';
import { notify } from '../utils/notify.js';

/**
 * Helper function to decrypt message content if it's encrypted
 * @param {Object} message - The message object
 * @returns {Object} - The message object with decrypted content
 */
function decryptMessageContent(message) {
  if (message.isEncrypted && message.content) {
    try {
      const decryptedContent = decryptMessageWithKey(message.content);
      return { ...message.toObject(), content: decryptedContent };
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      // Return the message with an error indicator
      return { ...message.toObject(), content: '[Encrypted - Decryption Failed]' };
    }
  }
  return message.toObject ? message.toObject() : message;
}

/**
 * Helper function to decrypt an array of messages
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Array of messages with decrypted content
 */
function decryptMessages(messages) {
  return messages.map(decryptMessageContent);
}

export const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, content, listingId } = req.body;
    if (!receiverId || !content || !String(content).trim()) return next(errorHandler(400, 'Write a message first.'));
    if (String(receiverId) === String(req.user.id)) return next(errorHandler(400, 'You cannot message yourself.'));
    // The receiver must be a live member of this workspace: a stale id used
    // to create a message nobody could ever read.
    if (!mongoose.isValidObjectId(receiverId)) return next(errorHandler(400, 'Choose who to send this to.'));
    const receiver = await User.findById(receiverId).select('_id isDeleted status').lean();
    if (!receiver || receiver.isDeleted) return next(errorHandler(404, 'That person is no longer on your team.'));
    let finalContent = String(content).trim();
    try {
      if (listingId) {
        const listing = await Listing.findById(listingId).lean();
        if (listing) {
          const price = listing.offer ? listing.discountPrice : listing.regularPrice;
          const priceSuffix = listing.type === 'rent' ? ' / month' : '';
          // In the workspace's own currency; this printed "$" for everyone.
          const loc = req.tenant?.locale || {};
          const priceText = price > 1
            ? new Intl.NumberFormat(loc.numberLocale || 'en-IN', { style: 'currency', currency: loc.currency || 'INR', maximumFractionDigits: 0 }).format(price)
            : 'Price on request';
          const link = `${process.env.PUBLIC_BASE_URL || ''}/listing/${listing._id}`.replace(/\/$/, '');
          const details = `\n\n---\nProperty: ${listing.name}\nAddress: ${listing.address}\nPrice: ${priceText}${priceSuffix}\nType: ${listing.type}${listing.category ? `\nCategory: ${String(listing.category).toUpperCase()}` : ''}\nLink: ${link}`;
          finalContent = `${content}${details}`;
        }
      }
    } catch (_) {}
    // Encrypt the message content
    const encryptedContent = encryptMessageWithKey(finalContent);
    
    const msg = await Message.create({
      senderId: req.user.id,
      receiverId,
      listingId: listingId || null,
      content: encryptedContent,
      isEncrypted: true,
    });
    // Fetch sender details for notification
    const sender = await inHomeTenant(req, () =>
      User.findById(req.user.id).select('username firstName lastName').lean()
    );
    // First name alone is still a name; it used to need both.
    const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || null;
    // Return plaintext content in all outgoing responses
    const decrypted = {
      ...msg.toObject(),
      content: finalContent,
      senderName,
      senderUsername: sender?.username,
    };
    // Notify receiver about new message and update conversations
    io.to(`user:${receiverId}`).emit('message:new', decrypted);
    io.to(`user:${receiverId}`).emit('conversations:update');
    // Update sender conversations list as well (for last message preview)
    io.to(`user:${req.user.id}`).emit('conversations:update');
    // Confirm to sender that message is persisted (delivery)
    io.to(`user:${req.user.id}`).emit('message:sent', decrypted);
    // The bell keeps it: the live toast used to be the only trace, and it
    // was gone in five seconds if you were on another screen.
    // One bell row per sender while it is unread: a ten-message chat used
    // to leave ten notifications. A further message refreshes that row.
    const who = senderName || sender?.username || 'a colleague';
    const preview = finalContent.length > 120 ? `${finalContent.slice(0, 120)}…` : finalContent;
    const pending = await Notification.findOne({
      user: receiverId, type: 'message.received', createdBy: req.user.id, readAt: null,
    }).select('_id').lean();
    if (pending) {
      // Through the driver: createdAt is immutable to Mongoose, and moving it
      // is what puts the row back at the top of the feed. Keyed by _id, which
      // the tenant-scoped findOne above already vetted.
      await Notification.collection.updateOne(
        { _id: pending._id },
        { $set: { title: `New messages from ${who}`, body: preview, createdAt: new Date(), updatedAt: new Date() } }
      );
    } else {
      notify({
        to: receiverId,
        type: 'message.received',
        title: `New message from ${who}`,
        body: preview,
        // Opens this conversation, not just the inbox.
        link: `/messages?user=${req.user.id}`,
        actorId: req.user.id,
      }).catch(() => {});
    }
    res.status(201).json(decrypted);
  } catch (error) {
    next(error);
  }
};

export const getInbox = async (req, res, next) => {
  try {
    const msgs = await Message.find({ receiverId: req.user.id }).sort({ createdAt: -1 });
    const decryptedMsgs = decryptMessages(msgs);
    res.status(200).json(decryptedMsgs);
  } catch (error) {
    next(error);
  }
};

export const getSent = async (req, res, next) => {
  try {
    const msgs = await Message.find({ senderId: req.user.id }).sort({ createdAt: -1 });
    const decryptedMsgs = decryptMessages(msgs);
    res.status(200).json(decryptedMsgs);
  } catch (error) {
    next(error);
  }
};

export const getThread = async (req, res, next) => {
  try {
    const otherId = req.params.otherId;
    const userId = req.user.id;
    const msgs = await Message.find({
      $or: [
        { senderId: userId, receiverId: otherId },
        { senderId: otherId, receiverId: userId },
      ],
    }).sort({ createdAt: 1 });
    const decryptedMsgs = decryptMessages(msgs);
    res.status(200).json(decryptedMsgs);
  } catch (error) {
    next(error);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const { otherId } = req.body;
    if (!otherId) return next(errorHandler(400, 'Missing otherId'));
    const result = await Message.updateMany(
      { senderId: otherId, receiverId: req.user.id, read: false },
      { $set: { read: true } }
    );
    // Reading the chat settles its bell row too.
    await Notification.updateMany(
      { user: req.user.id, type: 'message.received', createdBy: otherId, readAt: null },
      { $set: { readAt: new Date() } }
    ).catch(() => {});
    io.to(`user:${otherId}`).emit('message:read', { from: req.user.id });
    // Update the conversations list/badge for the user who marked as read
    io.to(`user:${req.user.id}`).emit('conversations:update');
    res.status(200).json({ modified: result.modifiedCount || 0 });
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (req, res, next) => {
  try {
    const userId = String(req.user.id);
    const msgs = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(500);

    // senderId/receiverId are ObjectIds since the model changed, and this
    // compared them to the string id with ===, which is never true. Every
    // message became its own "conversation" keyed by an ObjectId instance, no
    // name could be looked up ("Unknown user" everywhere), and unread was
    // always 0. Compare and key as strings.
    const map = new Map();
    for (const m of msgs) {
      const sender = String(m.senderId);
      const receiver = String(m.receiverId);
      const otherId = sender === userId ? receiver : sender;
      if (!map.has(otherId)) {
        map.set(otherId, { otherId, lastMessage: decryptMessageContent(m), unread: 0 });
      }
      if (!m.read && receiver === userId) map.get(otherId).unread++;
    }
    const list = Array.from(map.values());
    const users = await User.find({ _id: { $in: list.map((e) => e.otherId) } })
      .select('username firstName lastName avatar _id')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    // Someone who has left the workspace still gets a name, so the thread can
    // be read rather than showing as unknown.
    const withUsers = list.map((e) => ({
      ...e,
      otherUser: userMap.get(e.otherId) || { _id: e.otherId, username: 'Former team member' },
    }));
    res.status(200).json(withUsers);
  } catch (error) {
    next(error);
  }
};

export const getOnlineUsers = async (req, res, next) => {
  try {
    // This workspace's people only. It used to read a process-global Set, so
    // the response enumerated every signed-in user on the deployment.
    const ids = onlineInTenant(req.tenantId).filter((id) => id !== req.user.id);
    if (ids.length === 0) return res.status(200).json([]);
    const users = await User.find({ _id: { $in: ids }, status: { $ne: 'inactive' } })
      .select('username firstName lastName avatar _id')
      .lean();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};
