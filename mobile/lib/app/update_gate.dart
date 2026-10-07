import 'package:flutter/material.dart';

import '../core/update/app_update.dart';

/// Checks once per launch for a newer build and offers it. Wrap a screen that
/// sits inside the Navigator (the dialog needs one).
class UpdateGate extends StatefulWidget {
  const UpdateGate({super.key, required this.child});
  final Widget child;

  @override
  State<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends State<UpdateGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final update = await AppUpdater.check();
      if (update != null && mounted) {
        await showDialog<void>(context: context, barrierDismissible: false, builder: (_) => _UpdateDialog(update: update));
      }
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.update});
  final AppUpdate update;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  double? _progress; // null = not started
  String? _error;

  Future<void> _start() async {
    setState(() {
      _progress = 0;
      _error = null;
    });
    final error = await AppUpdater.downloadAndInstall(widget.update, (p) {
      if (mounted) setState(() => _progress = p);
    });
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(); // the system installer is on screen now
    } else {
      setState(() {
        _progress = null;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.update;
    final downloading = _progress != null;
    return PopScope(
      canPop: !downloading,
      child: AlertDialog(
        title: Text('Update available (${u.version})'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (u.notes.isNotEmpty) Text(u.notes),
              if (u.sizeBytes > 0) ...[
                const SizedBox(height: 12),
                Text('${(u.sizeBytes / 1048576).toStringAsFixed(1)} MB', style: Theme.of(context).textTheme.bodySmall),
              ],
              if (downloading) ...[
                const SizedBox(height: 16),
                LinearProgressIndicator(value: _progress == 0 ? null : _progress),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 12),
              Text(
                'Android will ask you to confirm the install. Your data and sign-in stay as they are.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: downloading ? null : () => Navigator.of(context).pop(), child: const Text('Later')),
          FilledButton(onPressed: downloading ? null : _start, child: Text(_error != null ? 'Try again' : 'Update now')),
        ],
      ),
    );
  }
}
