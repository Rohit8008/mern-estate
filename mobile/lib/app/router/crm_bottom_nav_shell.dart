import '../update_gate.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import 'quick_action_sheet.dart';

// Branch order must match app_router.dart: home, leads, search, properties,
// activities. Search sits in the centre — finding a property is the app's
// most-used action, so it gets the most-reachable tab.
const _tabTitles = ['Dashboard', 'Leads', 'Search', 'Properties', 'Activities'];
const _tabIcons = [Icons.home_outlined, Icons.people_alt_outlined, Icons.search_rounded, Icons.apartment_outlined, Icons.checklist_rounded];
const _tabIconsActive = [Icons.home_rounded, Icons.people_alt_rounded, Icons.search_rounded, Icons.apartment_rounded, Icons.checklist_rounded];

/// The app's single persistent chrome once authenticated: one shared AppBar
/// (title follows the active tab, quick-add + notifications + more on the
/// right) and a five-tab bottom bar with Search in the centre — mirrors
/// CrmShell.jsx's sidebar+topbar, reshaped for one thumb.
class CrmBottomNavShell extends StatelessWidget {
  const CrmBottomNavShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final index = navigationShell.currentIndex;
    final dark = Theme.of(context).brightness == Brightness.dark;
    // Android back on any non-Dashboard tab returns to the Dashboard instead
    // of leaving the app; only back on the Dashboard exits. Screens opened on
    // top of a tab are popped before this is ever asked.
    return PopScope(
        canPop: index == 0,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && index != 0) navigationShell.goBranch(0);
        },
        child: Scaffold(
          appBar: AppBar(
            title: Text(_tabTitles[index]),
            actions: [
              IconButton(
                icon: const Icon(Icons.add_rounded),
                tooltip: 'Quick add',
                onPressed: () => showQuickActionSheet(context),
              ),
              const NotificationBell(),
              IconButton(
                icon: const Icon(Icons.grid_view_rounded),
                tooltip: 'More',
                onPressed: () => context.push('/more'),
              ),
            ],
          ),
          body: UpdateGate(child: navigationShell),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              color: dark ? AppColors.slate900 : AppColors.white,
              border: Border(top: BorderSide(color: dark ? AppColors.slate800 : AppColors.slate200)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  for (var i = 0; i < _tabTitles.length; i++)
                    _NavButton(
                      label: _tabTitles[i],
                      icon: _tabIcons[i],
                      activeIcon: _tabIconsActive[i],
                      selected: index == i,
                      onTap: () => navigationShell.goBranch(i),
                    ),
                ],
              ),
            ),
          ),
        ));
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({required this.label, required this.icon, required this.activeIcon, required this.selected, required this.onTap});

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final color = selected
        ? (dark ? AppColors.indigo400 : AppColors.indigo600)
        : (dark ? AppColors.slate500 : AppColors.slate400);
    // The tab label is already announced via Semantics; the visible text is
    // excluded so screen readers don't read it twice.
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(selected ? activeIcon : icon, color: color, size: 22),
                  const SizedBox(height: 2),
                  // Four labels share a phone's width with the FAB notch; at
                  // large accessibility text they'd wrap and push the bar
                  // out of shape, so cap the growth and ellipsize instead.
                  MediaQuery.withClampedTextScaling(
                    maxScaleFactor: 1.3,
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
