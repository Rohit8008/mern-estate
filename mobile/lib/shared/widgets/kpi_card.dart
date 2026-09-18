import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import 'app_card.dart';

/// Port of design-system/KpiCard.jsx — accent top border, icon chip,
/// tabular-nums value, optional trend pill.
class KpiCard extends StatelessWidget {
  const KpiCard({
    super.key,
    required this.title,
    required this.value,
    this.icon,
    this.accent = AppAccent.blue,
    this.trendValue,
    this.trendLabel,
    this.onTap,
  });

  final String title;
  final String value;
  final IconData? icon;
  final AppAccent accent;
  final int? trendValue;
  final String? trendLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final swatch = AppAccentSwatch.of(accent);
    final ink = Theme.of(context).colorScheme.onSurface;

    return AppCard(
      topAccent: swatch.bar,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.slate500, letterSpacing: 0.5),
                ),
              ),
              if (icon != null)
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: swatch.iconBg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: swatch.iconRing),
                  ),
                  child: Icon(icon, size: 18, color: swatch.text),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 28, fontWeight: FontWeight.w800, color: ink, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
          if (trendValue != null) ...[
            const SizedBox(height: 8),
            _TrendPill(value: trendValue!, label: trendLabel),
          ],
        ],
      ),
    );
  }
}

class _TrendPill extends StatelessWidget {
  const _TrendPill({required this.value, this.label});
  final int value;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final positive = value >= 0;
    final bg = positive ? AppColors.emerald50 : AppColors.rose50;
    final fg = positive ? AppColors.emerald700 : AppColors.rose700;
    return DecoratedBox(
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        child: Text(
          '${positive ? '↑' : '↓'} ${value.abs()}%${label != null ? ' $label' : ''}',
          style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
