/// Mirrors backend/models/transaction.model.js — the closed/closing
/// financial ledger row, distinct from a Client.deals[] pipeline entry
/// (which lives before a deal formalizes into a transaction).
class CrmTransaction {
  const CrmTransaction({
    required this.id,
    this.propertyId,
    required this.propertyName,
    this.clientId,
    required this.clientName,
    required this.type,
    required this.amount,
    required this.commissionPercent,
    required this.commission,
    required this.status,
    this.date,
    this.notes,
  });

  final String id;
  final String? propertyId;
  final String propertyName;
  final String? clientId;
  final String clientName;
  final String type;
  final num amount;
  final num commissionPercent;
  final num commission;
  final String status;
  final DateTime? date;
  final String? notes;

  factory CrmTransaction.fromJson(Map<String, dynamic> json) => CrmTransaction(
        id: (json['_id'] ?? json['id']) as String,
        propertyId: json['property'] as String?,
        propertyName: json['propertyName'] as String? ?? 'Untitled property',
        clientId: json['client'] as String?,
        clientName: json['clientName'] as String? ?? 'Unknown client',
        type: json['type'] as String? ?? 'sale',
        amount: (json['amount'] as num?) ?? 0,
        commissionPercent: (json['commissionPercent'] as num?) ?? 0,
        commission: (json['commission'] as num?) ?? 0,
        status: json['status'] as String? ?? 'pending',
        date: DateTime.tryParse(json['date'] as String? ?? ''),
        notes: json['notes'] as String?,
      );
}

class TransactionStats {
  const TransactionStats({required this.totalPipeline, required this.totalCommission, required this.completed, required this.pending});

  final num totalPipeline;
  final num totalCommission;
  final int completed;
  final int pending;

  factory TransactionStats.fromJson(Map<String, dynamic> json) => TransactionStats(
        totalPipeline: (json['totalPipeline'] as num?) ?? 0,
        totalCommission: (json['totalCommission'] as num?) ?? 0,
        completed: (json['completed'] as num?)?.toInt() ?? 0,
        pending: (json['pending'] as num?)?.toInt() ?? 0,
      );
}

const transactionStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
const transactionTypes = ['sale', 'rent', 'lease'];

String transactionStatusLabel(String status) =>
    status.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
