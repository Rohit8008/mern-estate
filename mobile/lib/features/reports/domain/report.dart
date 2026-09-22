class ReportTemplate {
  const ReportTemplate({
    required this.id,
    required this.name,
    required this.type,
    required this.description,
    required this.usageCount,
    this.lastUsed,
  });

  final String id;
  final String name;
  final String type;
  final String description;
  final int usageCount;
  final DateTime? lastUsed;

  factory ReportTemplate.fromJson(Map<String, dynamic> json) => ReportTemplate(
        id: (json['_id'] ?? json['id']) as String,
        name: json['name'] as String? ?? 'Untitled',
        type: json['type'] as String? ?? '',
        description: json['description'] as String? ?? '',
        usageCount: (json['usageCount'] as num?)?.toInt() ?? 0,
        lastUsed: DateTime.tryParse(json['lastUsed'] as String? ?? ''),
      );
}

class GeneratedReport {
  const GeneratedReport({
    required this.id,
    required this.templateName,
    required this.clientName,
    required this.propertyName,
    required this.status,
    this.reportDate,
  });

  final String id;
  final String templateName;
  final String clientName;
  final String propertyName;
  final String status;
  final DateTime? reportDate;

  bool get isSent => status == 'sent';

  factory GeneratedReport.fromJson(Map<String, dynamic> json) => GeneratedReport(
        id: (json['_id'] ?? json['id']) as String,
        templateName: json['templateName'] as String? ?? '',
        clientName: json['clientName'] as String? ?? '',
        propertyName: json['propertyName'] as String? ?? '',
        status: json['status'] as String? ?? 'draft',
        reportDate: DateTime.tryParse(json['reportDate'] as String? ?? ''),
      );
}

/// Templates and the reports made from them arrive from two endpoints but read
/// as one screen, so they load together.
class ReportsOverview {
  const ReportsOverview({required this.templates, required this.generated});

  final List<ReportTemplate> templates;
  final List<GeneratedReport> generated;
}
