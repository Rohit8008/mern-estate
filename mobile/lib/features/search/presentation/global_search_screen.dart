import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../buyers/presentation/buyers_list_screen.dart';
import '../../leads/presentation/leads_list_screen.dart';
import '../../owners/presentation/owners_list_screen.dart';
import '../../properties/presentation/property_detail_screen.dart';
import '../domain/search_result.dart';
import '../search_providers.dart';

/// One search box across everything — properties, leads, owners, buyer
/// requirements. Debounced; tapping a property opens it, other results open
/// their list. Mirrors the web ⌘K palette.
class GlobalSearchScreen extends ConsumerStatefulWidget {
  const GlobalSearchScreen({super.key});

  @override
  ConsumerState<GlobalSearchScreen> createState() => _GlobalSearchScreenState();
}

class _GlobalSearchScreenState extends ConsumerState<GlobalSearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<SearchGroup>? _groups;
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
      setState(() { _groups = null; _loading = false; _error = null; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(q));
  }

  Future<void> _run(String q) async {
    final seq = ++_seq;
    try {
      final groups = await ref.read(searchApiProvider).search(q);
      if (!mounted || seq != _seq) return; // a newer keystroke superseded this
      setState(() { _groups = groups; _loading = false; _error = null; });
    } on AppFailure catch (f) {
      if (!mounted || seq != _seq) return;
      setState(() { _error = f.message; _loading = false; });
    }
  }

  void _open(String entity, SearchItem item) {
    Widget? screen;
    switch (entity) {
      case 'listings':
        screen = PropertyDetailScreen(listingId: item.id);
        break;
      case 'clients':
        screen = const LeadsListScreen();
        break;
      case 'owners':
        screen = const OwnersListScreen();
        break;
      case 'buyers':
        screen = const BuyersListScreen();
        break;
    }
    if (screen != null) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen!));
    }
  }

  IconData _icon(String entity) {
    switch (entity) {
      case 'listings': return Icons.apartment_rounded;
      case 'clients': return Icons.person_outline_rounded;
      case 'owners': return Icons.groups_2_outlined;
      case 'buyers': return Icons.fact_check_outlined;
      default: return Icons.search_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: _onChanged,
          decoration: const InputDecoration(
            hintText: 'Search properties, leads, owners…',
            border: InputBorder.none,
          ),
        ),
        actions: [
          if (_controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close_rounded),
              onPressed: () { _controller.clear(); _onChanged(''); },
            ),
        ],
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const AppPageLoader();
    if (_error != null) return AppErrorState(title: 'Search failed', message: _error);
    final groups = _groups;
    if (groups == null) {
      return const AppEmptyState(
        icon: Icons.search_rounded,
        title: 'Search everything',
        message: 'Find a property, lead, owner or buyer requirement — type at least two letters.',
      );
    }
    if (groups.isEmpty) {
      return const AppEmptyState(icon: Icons.search_off_rounded, title: 'No matches', message: 'Try a different search.');
    }
    return ListView(
      children: [
        for (final g in groups) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.xs),
            child: Text(g.label.toUpperCase(),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: AppColors.slate400)),
          ),
          for (final item in g.items)
            ListTile(
              leading: Icon(_icon(g.entity), color: AppColors.indigo600),
              title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: item.subtitle.isEmpty
                  ? null
                  : Text(item.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
              onTap: () => _open(g.entity, item),
            ),
        ],
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}
