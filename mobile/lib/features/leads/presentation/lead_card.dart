import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/contact_launcher.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/lead.dart';

class LeadCard extends StatelessWidget {
  const LeadCard({super.key, required this.lead, required this.onTap});

  final Lead lead;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final style = leadStatusStyle(lead.status);
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: style.color,
                child: Text(
                  lead.name.isNotEmpty ? lead.name[0].toUpperCase() : '?',
                  style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(lead.name,
                              maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                        ),
                        if (lead.contactType != 'lead') ...[
                          const SizedBox(width: 6),
                          AppBadge(label: leadContactTypeLabel(lead.contactType), variant: AppBadgeVariant.purple),
                        ],
                      ],
                    ),
                    if (lead.organization != null && lead.organization!.isNotEmpty)
                      Text(lead.organization!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
                  ],
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(color: style.color, borderRadius: BorderRadius.circular(999)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  child: Text(style.label, style: const TextStyle(color: AppColors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
          if (lead.phone != null || lead.email != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                if (lead.phone != null) ...[
                  _QuickActionIcon(icon: Icons.call_outlined, color: AppColors.emerald600, onTap: () => ContactLauncher.call(lead.phone!)),
                  const SizedBox(width: AppSpacing.sm),
                  _QuickActionIcon(icon: Icons.chat_outlined, color: const Color(0xFF25D366), onTap: () => ContactLauncher.whatsapp(lead.phone!)),
                  const SizedBox(width: AppSpacing.sm),
                ],
                if (lead.email != null) _QuickActionIcon(icon: Icons.mail_outline_rounded, color: AppColors.indigo600, onTap: () => ContactLauncher.email(lead.email!)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickActionIcon extends StatelessWidget {
  const _QuickActionIcon({required this.icon, required this.color, required this.onTap});
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withOpacity(0.1),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(7), child: Icon(icon, size: 16, color: color)),
      ),
    );
  }
}
