/// One row of the in-app feed (GET /api/notifications). `link` is the web
/// path the notification points at — `/messages`, `/listing/:id`,
/// `/clients/:id`, `/tasks` — sometimes as an absolute URL.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.link,
    required this.createdAt,
    required this.read,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final String link;
  final DateTime? createdAt;
  final bool read;

  /// The path part of [link], whether it was stored relative or absolute.
  String get path {
    if (link.isEmpty) return '';
    final uri = Uri.tryParse(link);
    return uri == null ? link : uri.path;
  }

  AppNotification markedRead() =>
      AppNotification(id: id, type: type, title: title, body: body, link: link, createdAt: createdAt, read: true);

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: (json['_id'] ?? json['id'] ?? '').toString(),
        type: (json['type'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        body: (json['body'] ?? '').toString(),
        link: (json['link'] ?? '').toString(),
        createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()),
        read: json['readAt'] != null,
      );
}

class NotificationPage {
  const NotificationPage({required this.items, required this.total, required this.unread});
  final List<AppNotification> items;
  final int total;
  final int unread;
}
