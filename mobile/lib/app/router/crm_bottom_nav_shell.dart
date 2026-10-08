import '../update_gate.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/search/presentation/global_search_screen.dart';
import 'quick_action_sheet.dart';

const _tabTitles = ['Dashboard', 'Leads', 'Properties', 'Activities'];
const _tabIcons = [Icons.home_outlined, Icons.people_alt_outlined, Icons.apartment_outlined, Icons.checklist_rounded];
const _tabIconsActive = [Icons.home_rounded, Icons.people_alt_rounded, Icons.apartment_rounded, Icons.checklist_rounded];

/// The app's single persistent chrome once authenticated: one shared
/// AppBar (title follows the active tab), a notched bottom bar around a
/// central quick-action FAB, and an overflow entry to MoreScreen — mirrors
/// CrmShell.jsx's sidebar+topbar, reshaped for one thumb.
class CrmBottomNavShell extends StatelessWidget {
  const CrmBottomNavShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final index = navigationShell.currentIndex;
    // Android back on Leads/Properties/Activities returns to the Dashboard
    // instead of leaving the app; only back on the Dashboard exits. Screens
    // opened on top of a tab are popped before this is ever asked.
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
                icon: const Icon(Icons.search_rounded),
                tooltip: 'Search',
                onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const GlobalSearchScreen())),
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
          floatingActionButton: FloatingActionButton(
            onPressed: () => showQuickActionSheet(context),
            tooltip: 'Quick add',
            backgroundColor: AppColors.indigo600,
            child: const Icon(Icons.add_rounded, color: AppColors.white),
          ),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
          bottomNavigationBar: BottomAppBar(
            shape: const CircularNotchedRectangle(),
            notchMargin: 8,
            padding: EdgeInsets.zero,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _NavButton(
                    label: _tabTitles[0], icon: _tabIcons[0], activeIcon: _tabIconsActive[0], selected: index == 0, onTap: () => navigationShell.goBranch(0)),
                _NavButton(
                    label: _tabTitles[1], icon: _tabIcons[1], activeIcon: _tabIconsActive[1], selected: index == 1, onTap: () => navigationShell.goBranch(1)),
                const SizedBox(width: 56),
                _NavButton(
                    label: _tabTitles[2], icon: _tabIcons[2], activeIcon: _tabIconsActive[2], selected: index == 2, onTap: () => navigationShell.goBranch(2)),
                _NavButton(
                    label: _tabTitles[3], icon: _tabIcons[3], activeIcon: _tabIconsActive[3], selected: index == 3, onTap: () => navigationShell.goBranch(3)),
              ],
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
