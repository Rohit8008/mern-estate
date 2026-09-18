import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Non-map-page delete confirmation, per CLAUDE.md's confirmation pattern
/// (map pages use an inline row strip instead — not applicable on mobile
/// list screens, so this modal is the one pattern mobile needs).
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Delete',
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel, style: const TextStyle(color: AppColors.rose600, fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  );
  return result ?? false;
}
