import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../config/env.dart';
import '../logging/app_logger.dart';

/// A newer build published on the server (https://…/app/latest.json, written by
/// scripts/publish-apk.sh). The app is sideloaded, so it checks this itself.
class AppUpdate {
  const AppUpdate({required this.version, required this.build, required this.file, required this.sizeBytes, required this.sha256, required this.notes});

  final String version;
  final int build;
  final String file;
  final int sizeBytes;
  final String sha256;
  final String notes;

  Uri get url => Uri.parse('${Env.apiBaseUrl}/app/$file');
}

abstract final class AppUpdater {
  static bool _checked = false;

  /// The newer build, or null if this is current, the check failed, or it has
  /// already run this launch. Never throws: a failed check just means no prompt.
  static Future<AppUpdate?> check() async {
    if (kIsWeb || !Platform.isAndroid || _checked) return null;
    _checked = true;
    try {
      final res = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 8), receiveTimeout: const Duration(seconds: 8)))
          .get<Map<String, dynamic>>('${Env.apiBaseUrl}/app/latest.json');
      final j = res.data;
      if (j == null) return null;
      final remoteBuild = (j['build'] as num?)?.toInt() ?? 0;
      final installed = int.tryParse((await PackageInfo.fromPlatform()).buildNumber) ?? 0;
      if (remoteBuild <= installed) return null;
      final file = j['file'] as String?;
      if (file == null || file.isEmpty || file.contains('/')) return null;
      return AppUpdate(
        version: (j['version'] as String?) ?? '',
        build: remoteBuild,
        file: file,
        sizeBytes: (j['sizeBytes'] as num?)?.toInt() ?? 0,
        sha256: (j['sha256'] as String?) ?? '',
        notes: (j['notes'] as String?) ?? '',
      );
    } catch (e) {
      appLog.info('update check skipped', fields: {'error': e.toString()});
      return null;
    }
  }

  /// Download, check the file against the published SHA-256, and hand it to
  /// Android's installer. Returns an error message, or null when the installer
  /// was opened.
  static Future<String?> downloadAndInstall(AppUpdate update, void Function(double progress) onProgress) async {
    try {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/${update.file}';
      await Dio().download(update.url.toString(), path, onReceiveProgress: (got, total) {
        final t = total > 0 ? total : update.sizeBytes;
        if (t > 0) onProgress((got / t).clamp(0.0, 1.0));
      });
      if (update.sha256.isNotEmpty) {
        final digest = await sha256.bind(File(path).openRead()).first;
        if (digest.toString() != update.sha256.toLowerCase()) {
          await File(path).delete();
          return 'The download was incomplete or damaged. Please try again.';
        }
      }
      final result = await OpenFilex.open(path, type: 'application/vnd.android.package-archive');
      if (result.type != ResultType.done) return 'Could not open the installer. ${result.message}';
      return null;
    } catch (e) {
      appLog.warn('update download failed', fields: {'error': e.toString()});
      return 'Could not download the update. Check your connection and try again.';
    }
  }
}
