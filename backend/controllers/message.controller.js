import { sendChatPush } from '../utils/push.js';
import { resolveDelivery } from '../utils/notificationTypes.js';
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
import { parsePaging } from '../utils/listQuery.js';
import { listingScope } from '../middleware/permissions.js';
import { logger } from '../utils/logger.js';

/**
 * Helper function to decrypt message content if it's encrypted
 * @param {Object} message - The message object
 * @returns {Object} - The message object with decrypted content
 */
function decryptMessageContent(message) {
  // Accepts a hydrated document or a lean/aggregated plain object.
  const plain = typeof message.toObject === 'function' ? message.toObject() : message;
  if (plain.isEncrypted && plain.content) {
    try {
      const decryptedContent = decryptMessageWithKey(plain.content);
      return { ...plain, content: decryptedContent };
    } catch (error) {
      logger.error('Message decryption failed', { message_id: String(plain?._id || ''), error });
      // Return the message with an error indicator
      return { ...plain, content: '[Encrypted - Decryption Failed]' };
    }
  }
  return plain;
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
        // Only a listing the sender may see: the details are copied into the message body.
        const listing = await Listing.findOne({ _id: listingId, ...listingScope(req.user) }).lean();
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

    // The phone, like a chat app: every message arrives on its own, with the
    // sender's name and the text, and the app stacks them per conversation.
    // Separate from the bell row above (one per sender), which is only the
    // history list. Respects the receiver's "new message" setting.
    const receiverPrefs = await User.findById(receiverId).select('preferences').lean();
    if (resolveDelivery(receiverPrefs?.preferences?.notifications, 'message.received').inApp) {
      sendChatPush(String(receiverId), {
        senderId: String(req.user.id),
        senderName: who,
        text: preview,
        messageId: String(msg?._id || ''),
      });
    }
    res.status(201).json(decrypted);
  } catch (error) {
    next(error);
  }
};

/**
 * A mailbox, newest first. These used to return the whole mailbox — every
 * message a person had ever received, decrypted one by one in the request.
 *
 * Without `page` the answer stays a bare array (the shape this endpoint has
 * always had), capped at the newest UNPAGED_MAILBOX_CAP. With `page` it is
 * `{ success, data, page, limit, total }`. No web or mobile screen calls these
 * two today — conversations and threads are what they use — so the cap
 * changes nothing anyone sees.
 */
const UNPAGED_MAILBOX_CAP = 500;

async function mailbox(req, res, filter) {
  if (req.query.page === undefined) {
    const msgs = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(UNPAGED_MAILBOX_CAP).lean();
    return res.status(200).json(decryptMessages(msgs));
  }
  const { page, limit, skip } = parsePaging(req.query);
  const [msgs, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);
  return res.status(200).json({ success: true, data: decryptMessages(msgs), page, limit, total });
}

export const getInbox = async (req, res, next) => {
  try {
    await mailbox(req, res, { receiverId: req.user.id });
  } catch (error) {
    next(error);
  }
};

export const getSent = async (req, res, next) => {
  try {
    await mailbox(req, res, { senderId: req.user.id });
  } catch (error) {
    next(error);
  }
};

const THREAD_DEFAULT_LIMIT = 500; // no screen pages older messages yet, so the default stays at the cap
const THREAD_MAX_LIMIT = 500;

/**
 * One conversation, oldest first — the newest `limit` messages (default 500),
 * not the whole history. The shape is unchanged (a bare array in reading
 * order), so existing clients keep working; they simply stop receiving years of
 * chat on open. To load older messages pass `before=<createdAt of the oldest
 * message you hold>`.
 */
export const getThread = async (req, res, next) => {
  try {
    const otherId = req.params.otherId;
    const userId = req.user.id;

    // There is no conversation with yourself. Return an empty thread rather than
    // folding your self-addressed messages back at you.
    if (String(otherId) === String(userId)) return res.status(200).json([]);

    const requested = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : THREAD_DEFAULT_LIMIT, 1), THREAD_MAX_LIMIT);

    const filter = {
      $or: [
        { senderId: userId, receiverId: otherId },
        { senderId: otherId, receiverId: userId },
      ],
    };

    if (req.query.before !== undefined && req.query.before !== '') {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) return next(errorHandler(400, 'before must be a date.'));
      filter.createdAt = { $lt: before };
    }

    const newestFirst = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    res.status(200).json(decryptMessages(newestFirst.reverse()));
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

/** How much of the latest message a conversation row carries. */
const PREVIEW_CHARS = 200;
/** Newest messages considered when building the list — unchanged from before. */
const CONVERSATION_WINDOW = 500;

export const getConversations = async (req, res, next) => {
  try {
    const userId = String(req.user.id);
    const me = new mongoose.Types.ObjectId(userId);

    // Grouped in the database: one row per counterpart with their latest message
    // and unread count, instead of up to 500 hydrated documents folded in Node.
    // senderId/receiverId are ObjectIds, so the comparison below is on ObjectIds
    // (the earlier string-vs-ObjectId bug made every message its own thread).
    const rows = await Message.aggregate([
      { $match: { $or: [{ senderId: me }, { receiverId: me }] } },
      { $sort: { createdAt: -1 } },
      { $limit: CONVERSATION_WINDOW },
      {
        $group: {
          _id: { $cond: [{ $eq: ['$senderId', me] }, '$receiverId', '$senderId'] },
          lastMessage: { $first: '$$ROOT' },
          lastAt: { $first: '$createdAt' },
          unread: {
            $sum: { $cond: [{ $and: [{ $eq: ['$receiverId', me] }, { $ne: ['$read', true] }] }, 1, 0] },
          },
        },
      },
      // Drop the self-thread: a message whose sender and receiver are both the
      // caller groups to a counterpart of themselves. Sending to yourself is
      // blocked, but legacy self-messages still exist, and a row you can open
      // only to be told "you cannot message yourself" is not a conversation.
      { $match: { _id: { $ne: me } } },
      { $sort: { lastAt: -1 } },
    ]);

    const list = rows.map((r) => {
      const last = decryptMessageContent(r.lastMessage);
      const content = String(last.content || '');
      return {
        otherId: String(r._id),
        // Truncated after decryption: a row shows a one-line preview, and the
        // full text (with an appended listing block) is in the thread.
        lastMessage: {
          ...last,
          content: content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}…` : content,
        },
        unread: r.unread,
      };
    });

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
