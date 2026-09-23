import 'dart:io';

import 'package:flutter/foundation.dart';

/// The workspace this device signs in to, chosen on the login screen.
///
/// Every agency shares one server address, so the name typed travels as the
/// `x-tenant` header on each request (see ApiClient). A session carries its
/// own workspace and the server trusts that over the header, so this decides
/// where signing in and "forgot password" look. Empty means the default
/// workspace. Same rule as the website's utils/workspace.js.
class WorkspaceStore extends ChangeNotifier {
  WorkspaceStore._(this._slug, this._file);

  /// In memory only — for tests and the web build.
  WorkspaceStore.memory([String slug = '']) : this._(slug, null);

  static Future<WorkspaceStore> open(Directory dir) async {
    final file = File('${dir.path}/workspace.txt');
    var slug = '';
    try {
      if (file.existsSync()) slug = normalise(await file.readAsString());
    } catch (_) {
      // Unreadable: start from the default workspace.
    }
    return WorkspaceStore._(slug, file);
  }

  String _slug;
  final File? _file;

  String get slug => _slug;

  Future<void> set(String value) async {
    _slug = normalise(value);
    notifyListeners();
    final file = _file;
    if (file == null) return;
    try {
      if (_slug.isEmpty) {
        if (file.existsSync()) await file.delete();
      } else {
        await file.writeAsString(_slug);
      }
    } catch (_) {
      // Kept for this run even if it could not be saved.
    }
  }

  /// Lower case, letters, digits and dashes — what a workspace name is.
  static String normalise(String value) => value.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9-]'), '');
}
