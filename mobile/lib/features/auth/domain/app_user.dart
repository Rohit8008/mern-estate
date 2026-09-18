/// The authenticated user, as returned by /api/auth/signin and /api/user/me.
/// `role` is the coarse gate (user/buyer/seller/employee/admin) — screen-
/// level feature gating instead reads the permission map from
/// /api/user/my-permissions (see permissions/ once a permission-gated
/// screen needs it).
class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.role,
    required this.status,
    this.firstName,
    this.lastName,
    this.avatar,
    this.phone,
  });

  final String id;
  final String username;
  final String email;
  final String role;
  final String status;
  final String? firstName;
  final String? lastName;
  final String? avatar;
  final String? phone;

  String get fullName {
    final parts = [firstName, lastName].where((s) => s != null && s.trim().isNotEmpty);
    return parts.isEmpty ? username : parts.join(' ');
  }

  bool get isAdmin => role == 'admin';
  bool get isEmployee => role == 'employee';
  bool get isCrmUser => isAdmin || isEmployee;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: (json['_id'] ?? json['id']) as String,
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        role: json['role'] as String? ?? 'user',
        status: json['status'] as String? ?? 'active',
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
        avatar: json['avatar'] as String?,
        phone: json['phone'] as String?,
      );
}
