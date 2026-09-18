import 'chat_user.dart';

/// Internal user-to-user messaging (Message model) — not client/WhatsApp/SMS,
/// which is logged separately inside a lead's Communications instead.
class ChatMessage {
  const ChatMessage({required this.id, required this.senderId, required this.receiverId, required this.content, required this.read, required this.createdAt});

  final String id;
  final String senderId;
  final String receiverId;
  final String content;
  final bool read;
  final DateTime createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['_id'] as String? ?? '',
        senderId: json['senderId'] as String? ?? '',
        receiverId: json['receiverId'] as String? ?? '',
        content: json['content'] as String? ?? '',
        read: json['read'] as bool? ?? false,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
      );
}

class Conversation {
  const Conversation({required this.otherId, this.otherUser, required this.lastMessage, required this.unread});

  final String otherId;
  final ChatUser? otherUser;
  final ChatMessage lastMessage;
  final int unread;

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        otherId: json['otherId'] as String? ?? '',
        otherUser: json['otherUser'] != null ? ChatUser.fromJson(json['otherUser'] as Map<String, dynamic>) : null,
        lastMessage: ChatMessage.fromJson(json['lastMessage'] as Map<String, dynamic>? ?? const {}),
        unread: (json['unread'] as num?)?.toInt() ?? 0,
      );
}
