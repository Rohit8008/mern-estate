import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/providers.dart';
import '../../../core/network/workspace_store.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../auth_providers.dart';
import '../data/auth_api.dart';

/// "Signing in to AkmRealtor · Change" on the login and forgot-password
/// screens — the app's half of the website's WorkspacePicker. Every agency
/// shares one server, so the person says which workspace is theirs; the name
/// is checked before it is kept, and remembered on this phone.
class WorkspaceTile extends ConsumerStatefulWidget {
  const WorkspaceTile({super.key, this.onChanged});

  final VoidCallback? onChanged;

  @override
  ConsumerState<WorkspaceTile> createState() => _WorkspaceTileState();
}

class _WorkspaceTileState extends ConsumerState<WorkspaceTile> {
  WorkspaceInfo? _current;

  @override
  void initState() {
    super.initState();
    _loadCurrent();
  }

  Future<void> _loadCurrent() async {
    final store = ref.read(apiClientProvider).workspace;
    final api = ref.read(authApiProvider);
    try {
      final ws = await api.lookupWorkspace(store.slug);
      if (mounted) setState(() => _current = ws);
    } on AppFailure {
      // A saved workspace that has since gone: back to the default one.
      if (store.slug.isNotEmpty) {
        await store.set('');
        return _loadCurrent();
      }
    }
  }

  Future<void> _change() async {
    final picked = await showModalBottomSheet<WorkspaceInfo>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _WorkspaceSheet(initial: ref.read(apiClientProvider).workspace.slug),
    );
    if (picked == null || !mounted) return;
    await ref.read(apiClientProvider).workspace.set(picked.slug);
    setState(() => _current = picked);
    widget.onChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: dark ? AppColors.slate900 : AppColors.slate50,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: dark ? AppColors.slate700 : AppColors.slate200),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: _change,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.apartment_rounded, size: 20, color: AppColors.slate500),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('SIGNING IN TO',
                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.slate500, letterSpacing: 0.5)),
                    const SizedBox(height: 1),
                    Text(_current?.name ?? '…',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const Text('Change', style: TextStyle(color: AppColors.indigo600, fontWeight: FontWeight.w600, fontSize: 13.5)),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkspaceSheet extends ConsumerStatefulWidget {
  const _WorkspaceSheet({required this.initial});
  final String initial;

  @override
  ConsumerState<_WorkspaceSheet> createState() => _WorkspaceSheetState();
}

class _WorkspaceSheetState extends ConsumerState<_WorkspaceSheet> {
  late final _controller = TextEditingController(text: widget.initial);
  bool _checking = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _check(String raw) async {
    final slug = WorkspaceStore.normalise(raw);
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final ws = await ref.read(authApiProvider).lookupWorkspace(slug);
      if (mounted) Navigator.of(context).pop(ws);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your workspace', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text("Your agency's workspace name, as given in your invitation email.",
              style: TextStyle(color: AppColors.slate500, fontSize: 13.5)),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Workspace name',
            hint: 'akmrealtor',
            controller: _controller,
            autofocus: true,
            textInputAction: TextInputAction.go,
            prefixIcon: Icons.apartment_rounded,
            onSubmitted: _check,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: 'Continue',
            onPressed: _checking ? null : () => _check(_controller.text),
            loading: _checking,
            variant: AppButtonVariant.brand,
            expand: true,
          ),
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: TextButton(
              onPressed: _checking ? null : () => _check(''),
              child: const Text('Use Real Vista (the main workspace)'),
            ),
          ),
        ],
      ),
    );
  }
}
