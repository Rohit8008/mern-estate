class ChatUser {
  const ChatUser({required this.id, required this.username, this.firstName, this.lastName, this.avatar});

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatar;

  String get displayName {
    final parts = [firstName, lastName].where((s) => s != null && s.trim().isNotEmpty);
    return parts.isEmpty ? username : parts.join(' ');
  }

  factory ChatUser.fromJson(Map<String, dynamic> json) => ChatUser(
        id: json['_id'] as String? ?? '',
        username: json['username'] as String? ?? 'Unknown',
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
        avatar: json['avatar'] as String?,
      );
}
