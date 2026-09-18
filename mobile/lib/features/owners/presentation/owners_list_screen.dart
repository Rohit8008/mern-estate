import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/contact_launcher.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/owner.dart';
import '../owners_providers.dart';
import 'owner_form_screen.dart';

class OwnersListScreen extends ConsumerStatefulWidget {
  const OwnersListScreen({super.key});

  @override
  ConsumerState<OwnersListScreen> createState() => _OwnersListScreenState();
}

class _OwnersListScreenState extends ConsumerState<OwnersListScreen> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(ownersSearchProvider.notifier).state = value.trim();
    });
  }

  @override
  Widget build(BuildContext context) {
    final ownersAsync = ref.watch(ownersControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Property Owners'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OwnerFormScreen())),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.sm),
            child: AppTextField(hint: 'Search owners…', prefixIcon: Icons.search_rounded, controller: _searchController, onChanged: _onSearchChanged),
          ),
          Expanded(
            child: ownersAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(title: 'Unable to load owners', onRetry: () => ref.read(ownersControllerProvider.notifier).refresh()),
              data: (owners) => owners.isEmpty
                  ? AppEmptyState(
                      icon: Icons.groups_2_outlined,
                      title: 'No property owners yet',
                      actionLabel: 'Add owner',
                      onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OwnerFormScreen())),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.read(ownersControllerProvider.notifier).refresh(),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                        itemCount: owners.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) => _OwnerRow(owner: owners[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OwnerRow extends ConsumerWidget {
  const _OwnerRow({required this.owner});
  final PropertyOwner owner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OwnerFormScreen(existing: owner))),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.slate200,
            child: Text(owner.name.isNotEmpty ? owner.name[0].toUpperCase() : '?', style: const TextStyle(color: AppColors.slate700, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(owner.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                if (owner.companyName != null && owner.companyName!.isNotEmpty)
                  Text(owner.companyName!, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                if (owner.city != null && owner.city!.isNotEmpty)
                  Text(owner.city!, style: const TextStyle(color: AppColors.slate400, fontSize: 11.5)),
              ],
            ),
          ),
          if (owner.phone != null && owner.phone!.isNotEmpty)
            IconButton(icon: const Icon(Icons.call_outlined, size: 18), onPressed: () => ContactLauncher.call(owner.phone!)),
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.rose500),
            onPressed: () => _delete(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showConfirmDialog(context, title: 'Delete this owner?', message: 'This action cannot be undone.');
    if (!confirmed) return;
    try {
      await ref.read(ownersApiProvider).delete(owner.id);
      ref.invalidate(ownersControllerProvider);
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}
