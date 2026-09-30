import 'package:flutter/material.dart';

import 'confirm_dialog.dart';

/// Remembers the text each controller started with, so "dirty" means the
/// user actually changed something — an edit form pre-filled from a record
/// is not dirty just because its fields have text in them.
class TextSnapshot {
  TextSnapshot(this.controllers) : _initial = [for (final c in controllers) c.text];

  final List<TextEditingController> controllers;
  final List<String> _initial;

  bool get changed {
    for (var i = 0; i < controllers.length; i++) {
      if (controllers[i].text != _initial[i]) return true;
    }
    return false;
  }

  Listenable get listenable => Listenable.merge(controllers);
}

/// Asks "Discard changes?" before back/swipe leaves a form with unsaved
/// edits. Only user-initiated pops are intercepted: a form closing itself
/// with Navigator.pop after a successful save is never blocked, because
/// PopScope does not veto a direct pop.
///
/// [listenable] rebuilds the guard as the user types, so [isDirty] is
/// re-read without the form having to setState on every keystroke; dropdown
/// changes already setState and rebuild it.
class DiscardGuard extends StatelessWidget {
  const DiscardGuard({super.key, required this.isDirty, required this.child, this.listenable});

  final bool Function() isDirty;
  final Listenable? listenable;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: listenable ?? const _NeverChanges(),
      child: child,
      builder: (context, child) => PopScope(
        canPop: !isDirty(),
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          final discard = await showConfirmDialog(
            context,
            title: 'Discard changes?',
            message: 'Your unsaved changes will be lost.',
            confirmLabel: 'Discard',
          );
          if (discard && context.mounted) Navigator.of(context).pop();
        },
        child: child!,
      ),
    );
  }
}

class _NeverChanges implements Listenable {
  const _NeverChanges();
  @override
  void addListener(VoidCallback listener) {}
  @override
  void removeListener(VoidCallback listener) {}
}
