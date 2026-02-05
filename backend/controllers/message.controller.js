import Message from '../models/message.model.js';
import { errorHandler } from '../utils/error.js';
import { io } from '../index.js';
import { onlineUsers } from '../utils/onlineUsers.js';
import User from '../models/user.model.js';
import Listing from '../models/listing.model.js';
import { encryptMessageWithKey, decryptMessageWithKey, isEncrypted } from '../utils/encryption.js';

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
    if (!receiverId || !content) return next(errorHandler(400, 'Missing fields'));
    let finalContent = content;
    try {
      if (listingId) {
        const listing = await Listing.findById(listingId).lean();
        if (listing) {
          const price = listing.offer ? listing.discountPrice : listing.regularPrice;
          const priceSuffix = listing.type === 'rent' ? ' / month' : '';
          const link = `${process.env.PUBLIC_BASE_URL || ''}/listing/${listing._id}`.replace(/\/$/, '');
          const details = `\n\n---\nProperty: ${listing.name}\nAddress: ${listing.address}\nPrice: $${price}${priceSuffix}\nType: ${listing.type}${listing.category ? `\nCategory: ${String(listing.category).toUpperCase()}` : ''}\nLink: ${link}`;
          finalContent = `${content}${details}`;
        }
      }
    } catch (_) {}
    // Encrypt the message content
    const encryptedContent = encryptMessageWithKey(finalContent);
    
    const msg = await Message.create({
      senderId: req.user.id,
      receiverId,
      listingId: listingId || '',
      content: encryptedContent,
      isEncrypted: true,
    });
    // Return plaintext content in all outgoing responses
    const decrypted = { ...msg.toObject(), content: finalContent };
    // Notify receiver about new message and update conversations
    io.to(`user:${receiverId}`).emit('message:new', decrypted);
    io.to(`user:${receiverId}`).emit('conversations:update');
    // Update sender conversations list as well (for last message preview)
    io.to(`user:${req.user.id}`).emit('conversations:update');
    // Confirm to sender that message is persisted (delivery)
    io.to(`user:${req.user.id}`).emit('message:sent', decrypted);
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
    const userId = req.user.id;
    const msgs = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(200);

    const map = new Map();
    for (const m of msgs) {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!map.has(otherId)) {
        // Decrypt the last message content for preview
        const decryptedMessage = decryptMessageContent(m);
        map.set(otherId, {
          otherId,
          lastMessage: decryptedMessage,
          unread: 0,
        });
      }
      const entry = map.get(otherId);
      if (!m.read && m.receiverId === userId) entry.unread++;
    }
    const list = Array.from(map.values());
    const otherIds = list.map((e) => e.otherId);
    const users = await User.find({ _id: { $in: otherIds } }).select('username avatar _id');
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const withUsers = list.map((e) => ({ ...e, otherUser: userMap.get(e.otherId) || null }));
    res.status(200).json(withUsers);
  } catch (error) {
    next(error);
  }
};

export const getOnlineUsers = async (req, res, next) => {
  try {
    const ids = Array.from(onlineUsers).filter((id) => id !== req.user.id);
    if (ids.length === 0) return res.status(200).json([]);
    const users = await User.find({ _id: { $in: ids }, status: { $ne: 'inactive' } })
      .select('username firstName lastName avatar _id')
      .lean();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};
