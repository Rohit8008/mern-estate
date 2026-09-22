import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/lead.dart';
import '../leads_providers.dart';

/// Choose a lead, then do something with it.
///
/// The quick-action sheet is reached from anywhere in the app, so unlike the
/// Follow-ups tab there is no lead in hand. Pops with the chosen [Lead].
///
/// It reuses `leadSearchQueryProvider`, which the leads list also watches —
/// so it deliberately restores whatever the query was on the way out, rather
/// than leaving the user's leads list filtered by a search they typed in a
/// modal and never saw again.
class LeadPickerScreen extends ConsumerStatefulWidget {
  const LeadPickerScreen({super.key, this.title = 'Choose a lead'});

  final String title;

  @override
  ConsumerState<LeadPickerScreen> createState() => _LeadPickerScreenState();
}

class _LeadPickerScreenState extends ConsumerState<LeadPickerScreen> {
  final _controller = TextEditingController();
  late final String _previousQuery = ref.read(leadSearchQueryProvider);
  late final ProviderContainer _container = ProviderScope.containerOf(context, listen: false);

  @override
  void initState() {
    super.initState();
    // Touch both late finals now: dispose() must not reach for `context`, and
    // reading the container after the element is unmounted throws.
    _previousQuery;
    _container;
  }

  @override
  void dispose() {
    // Put the leads list back the way we found it. Deferred, because changing
    // a provider synchronously during dispose throws while the tree unwinds.
    final container = _container;
    final previous = _previousQuery;
    Future.microtask(() => container.read(leadSearchQueryProvider.notifier).state = previous);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final leadsAsync = ref.watch(leadsListControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: AppTextField(
              hint: 'Search leads by name or phone',
              controller: _controller,
              prefixIcon: Icons.search_rounded,
              autofocus: true,
              onChanged: (v) => ref.read(leadSearchQueryProvider.notifier).state = v,
            ),
          ),
          Expanded(
            child: leadsAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(
                title: 'Could not load leads',
                message: error is AppFailure ? error.message : error.toString(),
                onRetry: () => ref.read(leadsListControllerProvider.notifier).refresh(),
              ),
              data: (leads) => leads.isEmpty
                  ? const AppEmptyState(
                      icon: Icons.person_search_outlined,
                      title: 'No leads found',
                      message: 'Try a different name or number.',
                    )
                  : ListView.separated(
                      itemCount: leads.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final lead = leads[index];
                        return ListTile(
                          title: Text(lead.name,
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                          subtitle: lead.phone != null && lead.phone!.isNotEmpty
                              ? Text(lead.phone!,
                                  style: const TextStyle(color: AppColors.slate400, fontSize: 12))
                              : null,
                          trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
                          onTap: () => Navigator.of(context).pop<Lead>(lead),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
