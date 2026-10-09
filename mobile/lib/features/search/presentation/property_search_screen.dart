import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../properties/presentation/property_detail_screen.dart';
import '../domain/search_result.dart';
import '../search_providers.dart';
import 'global_search_screen.dart';

/// The app's primary search surface — a dedicated tab, because finding a
/// property is the most-used action. Properties come first and are the focus;
/// a quiet link at the bottom opens the cross-entity search (leads, owners,
/// buyer requirements) for the rarer case.
class PropertySearchScreen extends ConsumerStatefulWidget {
  const PropertySearchScreen({super.key});

  @override
  ConsumerState<PropertySearchScreen> createState() => _PropertySearchScreenState();
}

class _PropertySearchScreenState extends ConsumerState<PropertySearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<SearchItem>? _results;
  bool _loading = false;
  String? _error;
  int _seq = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.length < 2) {
      setState(() { _results = null; _loading = false; _error = null; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(q));
  }

  Future<void> _run(String q) async {
    final seq = ++_seq;
    try {
      final groups = await ref.read(searchApiProvider).search(q, limit: 20);
      if (!mounted || seq != _seq) return; // a newer keystroke superseded this
      final listings = groups.where((g) => g.entity == 'listings').expand((g) => g.items).toList();
      setState(() { _results = listings; _loading = false; _error = null; });
    } on AppFailure catch (f) {
      if (!mounted || seq != _seq) return;
      setState(() { _error = f.message; _loading = false; });
    }
  }

  void _open(SearchItem item) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PropertyDetailScreen(listingId: item.id)));
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      children: [
        // Prominent, always-visible search box — the point of the tab.
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.sm),
          child: TextField(
            controller: _controller,
            textInputAction: TextInputAction.search,
            onChanged: _onChanged,
            decoration: InputDecoration(
              hintText: 'Search properties by title, location, owner…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close_rounded),
                      tooltip: 'Clear',
                      onPressed: () { _controller.clear(); _onChanged(''); setState(() {}); },
                    ),
              filled: true,
              fillColor: dark ? AppColors.slate900 : AppColors.white,
            ),
          ),
        ),
        Expanded(child: _body()),
      ],
    );
  }

  Widget _body() {
    if (_loading) return const AppPageLoader();
    if (_error != null) {
      return AppErrorState(
        title: 'Search failed',
        message: _error,
        onRetry: () => _run(_controller.text.trim()),
      );
    }
    final results = _results;
    if (results == null) {
      // Idle: explain what this does and offer browse / everything-search.
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const SizedBox(height: AppSpacing.xl),
          const Icon(Icons.search_rounded, size: 56, color: AppColors.slate300),
          const SizedBox(height: AppSpacing.md),
          const Text('Find a property',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate700)),
          const SizedBox(height: AppSpacing.xs),
          const Text('Type at least two letters — a title, locality, owner name or code.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: AppColors.slate500)),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            label: 'Browse all properties',
            variant: AppButtonVariant.secondary,
            expand: true,
            onPressed: () => context.go('/properties'),
          ),
          const SizedBox(height: AppSpacing.sm),
          _everythingLink(),
        ],
      );
    }
    if (results.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const SizedBox(height: AppSpacing.xl),
          const AppEmptyState(
            icon: Icons.search_off_rounded,
            title: 'No properties found',
            message: 'Nothing matches that search. Try a different word, or browse everything.',
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Browse all properties',
            variant: AppButtonVariant.secondary,
            expand: true,
            onPressed: () => context.go('/properties'),
          ),
          const SizedBox(height: AppSpacing.sm),
          _everythingLink(),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(0, AppSpacing.xs, 0, AppSpacing.xl),
      itemCount: results.length + 1,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 64),
      itemBuilder: (_, i) {
        if (i == results.length) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: _everythingLink(),
          );
        }
        final item = results[i];
        return ListTile(
          leading: const CircleAvatar(
            backgroundColor: AppColors.indigo50,
            child: Icon(Icons.apartment_rounded, color: AppColors.indigo600),
          ),
          title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: item.subtitle.isEmpty
              ? null
              : Text(item.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
          onTap: () => _open(item),
        );
      },
    );
  }

  /// Rarer need: search leads, owners and buyer requirements too.
  Widget _everythingLink() {
    return TextButton.icon(
      onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const GlobalSearchScreen())),
      icon: const Icon(Icons.travel_explore_rounded, size: 18),
      label: const Text('Search leads, owners & buyers too'),
    );
  }
}
