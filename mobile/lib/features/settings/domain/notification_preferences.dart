/// One row of the notification catalogue, as the server defines it.
///
/// The labels and descriptions come from the server's single catalogue
/// (utils/notificationTypes.js) rather than being restated here — a second
/// copy in Dart would drift the moment a type is added, and the screen would
/// quietly stop offering it.
class NotificationType {
  const NotificationType({
    required this.key,
    required this.label,
    required this.description,
    required this.inApp,
    required this.email,
  });

  final String key;
  final String label;
  final String description;
  final bool inApp;
  final bool email;

  NotificationType copyWith({bool? inApp, bool? email}) => NotificationType(
        key: key,
        label: label,
        description: description,
        inApp: inApp ?? this.inApp,
        email: email ?? this.email,
      );
}

class PrivacySettings {
  const PrivacySettings({
    required this.showEmail,
    required this.showPhone,
    required this.showOnlineStatus,
    required this.allowMessages,
  });

  final bool showEmail;
  final bool showPhone;
  final bool showOnlineStatus;
  final bool allowMessages;

  PrivacySettings copyWith({bool? showEmail, bool? showPhone, bool? showOnlineStatus, bool? allowMessages}) =>
      PrivacySettings(
        showEmail: showEmail ?? this.showEmail,
        showPhone: showPhone ?? this.showPhone,
        showOnlineStatus: showOnlineStatus ?? this.showOnlineStatus,
        allowMessages: allowMessages ?? this.allowMessages,
      );

  Map<String, dynamic> toJson() => {
        'showEmail': showEmail,
        'showPhone': showPhone,
        'showOnlineStatus': showOnlineStatus,
        'allowMessages': allowMessages,
      };

  factory PrivacySettings.fromJson(Map<String, dynamic> json) => PrivacySettings(
        showEmail: json['showEmail'] as bool? ?? false,
        showPhone: json['showPhone'] as bool? ?? false,
        showOnlineStatus: json['showOnlineStatus'] as bool? ?? true,
        allowMessages: json['allowMessages'] as bool? ?? true,
      );
}

class NotificationPreferences {
  const NotificationPreferences({required this.types, required this.privacy});

  final List<NotificationType> types;
  final PrivacySettings privacy;

  NotificationPreferences copyWith({List<NotificationType>? types, PrivacySettings? privacy}) =>
      NotificationPreferences(types: types ?? this.types, privacy: privacy ?? this.privacy);

  /// The catalogue is a map keyed by type id; the user's own choices come back
  /// separately under `notifications`. Joining them here keeps the screen from
  /// having to know that the two halves arrive apart.
  factory NotificationPreferences.fromJson(Map<String, dynamic> json) {
    final catalogue = (json['catalogue'] as Map<String, dynamic>?) ?? const {};
    final chosen = (json['notifications'] as Map<String, dynamic>?) ?? const {};

    final types = catalogue.entries.map((entry) {
      final meta = (entry.value as Map<String, dynamic>?) ?? const {};
      final mine = (chosen[entry.key] as Map<String, dynamic>?) ?? const {};
      return NotificationType(
        key: entry.key,
        label: meta['label'] as String? ?? entry.key,
        description: meta['description'] as String? ?? '',
        inApp: mine['inApp'] as bool? ?? true,
        email: mine['email'] as bool? ?? (meta['defaultEmail'] as bool? ?? false),
      );
    }).toList();

    return NotificationPreferences(
      types: types,
      privacy: PrivacySettings.fromJson((json['privacy'] as Map<String, dynamic>?) ?? const {}),
    );
  }

  Map<String, dynamic> notificationsPayload() => {
        for (final t in types) t.key: {'inApp': t.inApp, 'email': t.email},
      };
}
