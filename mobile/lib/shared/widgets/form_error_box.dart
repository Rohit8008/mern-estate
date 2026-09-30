import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// The rose strip under a form for errors the server sent back. Per-field
/// problems (a missing name, a malformed email) belong on the field itself;
/// this is for what only the server can know.
class FormErrorBox extends StatelessWidget {
  const FormErrorBox(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark ? AppColors.roseTintDark : AppColors.rose50,
          borderRadius: BorderRadius.circular(10),
          border: dark ? Border.all(color: AppColors.rose800) : null,
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline_rounded, size: 18, color: dark ? AppColors.rose300 : AppColors.rose600),
              const SizedBox(width: 8),
              Expanded(
                child: Text(message, style: TextStyle(color: dark ? AppColors.rose300 : AppColors.rose700, fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
