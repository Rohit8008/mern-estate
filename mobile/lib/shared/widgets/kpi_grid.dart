import 'package:flutter/material.dart';

import '../../core/theme/app_spacing.dart';

/// Two KPI cards per row, each row as tall as its tallest card.
///
/// The screens used GridView with a fixed mainAxisExtent, which clips or
/// overflows the moment a card holds more than it was sized for: a sub-line,
/// a long label, or the phone's larger font setting.
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children, this.columns = 2});

  final List<Widget> children;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += columns) {
      final cells = <Widget>[];
      for (var j = 0; j < columns; j++) {
        if (j > 0) cells.add(const SizedBox(width: AppSpacing.md));
        final k = i + j;
        cells.add(Expanded(child: k < children.length ? children[k] : const SizedBox.shrink()));
      }
      if (rows.isNotEmpty) rows.add(const SizedBox(height: AppSpacing.md));
      rows.add(IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: cells)));
    }
    return Column(mainAxisSize: MainAxisSize.min, children: rows);
  }
}
