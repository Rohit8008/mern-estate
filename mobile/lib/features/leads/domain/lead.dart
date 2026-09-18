import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'communication.dart';
import 'deal.dart';
import 'follow_up.dart';

/// A Client record (backend name) — the sales-lead/pipeline entity, distinct
/// from Owner (property landlord) and BuyerRequirement (demand matching).
/// See the architecture writeup's entity-model section for why these three
/// stay separate on mobile too. Deals/follow-ups/communications/tasks are
/// fetched separately per-lead (see leads_providers.dart) rather than
/// parsed off this object, since the list endpoint doesn't need them.
class Lead {
  const Lead({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.alternatePhone,
    this.organization,
    required this.status,
    required this.priority,
    required this.contactType,
    this.source,
    this.notes,
    this.createdAt,
    this.updatedAt,
    this.lastContactAt,
    this.deals = const [],
    this.followUps = const [],
    this.communications = const [],
  });

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? alternatePhone;
  final String? organization;
  final String status;
  final String priority;
  final String contactType;
  final String? source;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? lastContactAt;
  final List<Deal> deals;
  final List<FollowUp> followUps;
  final List<Communication> communications;

  factory Lead.fromJson(Map<String, dynamic> json) => Lead(
        id: (json['_id'] ?? json['id']) as String,
        name: json['name'] as String? ?? 'Unnamed',
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        alternatePhone: json['alternatePhone'] as String?,
        organization: json['organization'] as String?,
        status: json['status'] as String? ?? 'lead',
        priority: json['priority'] as String? ?? 'medium',
        contactType: json['contactType'] as String? ?? 'lead',
        source: json['source'] as String?,
        notes: json['notes'] as String?,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
        updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
        lastContactAt: DateTime.tryParse(json['lastContactAt'] as String? ?? ''),
        deals: ((json['deals'] as List?) ?? const []).map((e) => Deal.fromJson(e as Map<String, dynamic>)).toList(),
        followUps:
            ((json['followUps'] as List?) ?? const []).map((e) => FollowUp.fromJson(e as Map<String, dynamic>)).toList(),
        communications: ((json['communications'] as List?) ?? const [])
            .map((e) => Communication.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Mirrors STATUS_ORDER / STATUS_CONFIG in ContactsBoard.jsx.
const leadStatusOrder = ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

class LeadStatusStyle {
  const LeadStatusStyle(this.label, this.color);
  final String label;
  final Color color;
}

const _leadStatusStyles = {
  'lead': LeadStatusStyle('Lead', AppColors.purple500),
  'contacted': LeadStatusStyle('Contacted', AppColors.blue500),
  'qualified': LeadStatusStyle('Qualified', Color(0xFF06B6D4)),
  'proposal': LeadStatusStyle('Proposal', AppColors.amber500),
  'negotiation': LeadStatusStyle('Negotiation', Color(0xFFF97316)),
  'won': LeadStatusStyle('Won', AppColors.emerald500),
  'lost': LeadStatusStyle('Lost', AppColors.slate400),
};

LeadStatusStyle leadStatusStyle(String status) => _leadStatusStyles[status] ?? _leadStatusStyles['lead']!;

const leadContactTypes = ['lead', 'co_agent', 'referral_partner'];

String leadContactTypeLabel(String type) => switch (type) {
      'co_agent' => 'Co-Agent',
      'referral_partner' => 'Referral Partner',
      _ => 'Lead',
    };

const leadPriorities = ['low', 'medium', 'high', 'urgent'];
