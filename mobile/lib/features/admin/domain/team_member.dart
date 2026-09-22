class TeamMember {
  const TeamMember({
    required this.id,
    required this.username,
    required this.email,
    required this.role,
    required this.status,
    this.firstName,
    this.lastName,
  });

  final String id;
  final String username;
  final String email;
  final String role;
  final String status;
  final String? firstName;
  final String? lastName;

  bool get isActive => status == 'active';
  bool get isAdmin => role == 'admin';

  String get displayName {
    final parts = [firstName, lastName].where((s) => s != null && s.trim().isNotEmpty);
    return parts.isEmpty ? username : parts.join(' ');
  }

  TeamMember copyWith({String? status}) => TeamMember(
        id: id,
        username: username,
        email: email,
        role: role,
        status: status ?? this.status,
        firstName: firstName,
        lastName: lastName,
      );

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        id: (json['_id'] ?? json['id']) as String,
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        role: json['role'] as String? ?? 'user',
        status: json['status'] as String? ?? 'active',
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
      );
}

class WorkspaceRole {
  const WorkspaceRole({
    required this.id,
    required this.name,
    required this.description,
    required this.permissionCount,
    required this.isSystem,
  });

  final String id;
  final String name;
  final String description;
  final int permissionCount;
  final bool isSystem;

  /// `permissions` is a map of flag -> bool, so the useful number is how many
  /// are actually granted, not how many keys exist.
  factory WorkspaceRole.fromJson(Map<String, dynamic> json) {
    final perms = (json['permissions'] as Map<String, dynamic>?) ?? const {};
    return WorkspaceRole(
      id: (json['_id'] ?? json['id']) as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      permissionCount: perms.values.where((v) => v == true).length,
      isSystem: json['isSystem'] as bool? ?? false,
    );
  }
}

class AdminOverview {
  const AdminOverview({required this.members, required this.roles});

  final List<TeamMember> members;
  final List<WorkspaceRole> roles;

  AdminOverview copyWith({List<TeamMember>? members}) =>
      AdminOverview(members: members ?? this.members, roles: roles);
}
