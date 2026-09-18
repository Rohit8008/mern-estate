import 'package:flutter/material.dart';

import 'app_states.dart';

/// Stand-in for a feature not yet built in the current phase — used from
/// the More sheet and quick-action sheet so every destination is at least
/// reachable and honest about its status, never a dead tap.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AppEmptyState(
        icon: Icons.construction_rounded,
        title: '$title is coming soon',
        message: 'This screen is scheduled for a later build phase.',
      ),
    );
  }
}
