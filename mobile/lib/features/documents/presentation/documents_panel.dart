import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../documents_providers.dart';
import '../domain/crm_document.dart';
import 'image_preview_screen.dart';

const _allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'jpg', 'jpeg', 'png'];

/// Embeddable panel (no Scaffold of its own) — used both in a lead's
/// Documents tab and a property's detail screen, matching the polymorphic
/// Document.related.kind on the backend. Preview is "open externally" for
/// everything except images (view inline) — no in-app PDF/Office renderer
/// for v1, matching how Messages stayed REST-only: a real viewer is its own
/// scoped feature, not a corner of this one.
class DocumentsPanel extends ConsumerWidget {
  const DocumentsPanel({super.key, required this.kind, required this.refId});

  final String kind;
  final String refId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final documentsAsync = ref.watch(documentsProvider((kind, refId)));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Documents', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            TextButton.icon(
              onPressed: () => _upload(context, ref),
              icon: const Icon(Icons.upload_file_outlined, size: 16),
              label: const Text('Upload'),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        documentsAsync.when(
          loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: AppSpacing.xl), child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
          error: (error, _) => AppErrorState(title: 'Unable to load documents', onRetry: () => ref.invalidate(documentsProvider((kind, refId)))),
          data: (documents) => documents.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                  child: Center(child: Text('No documents yet', style: TextStyle(color: AppColors.slate400, fontSize: 13))),
                )
              : Column(children: [for (final doc in documents) _DocumentRow(document: doc, kind: kind, refId: refId)]),
        ),
      ],
    );
  }

  Future<void> _upload(BuildContext context, WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(withData: true, type: FileType.custom, allowedExtensions: _allowedExtensions);
    final file = result?.files.single;
    if (file == null || file.bytes == null) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(documentsApiProvider).upload(kind: kind, refId: refId, bytes: file.bytes!, filename: file.name);
      ref.invalidate(documentsProvider((kind, refId)));
    } on AppFailure catch (f) {
      messenger.showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}

class _DocumentRow extends ConsumerWidget {
  const _DocumentRow({required this.document, required this.kind, required this.refId});
  final CrmDocument document;
  final String kind;
  final String refId;

  IconData get _icon {
    if (document.isImage) return Icons.image_outlined;
    if (document.mimeType == 'application/pdf') return Icons.picture_as_pdf_outlined;
    if (document.mimeType.contains('word')) return Icons.description_outlined;
    if (document.mimeType.contains('sheet') || document.mimeType.contains('excel')) return Icons.table_chart_outlined;
    if (document.mimeType.contains('presentation') || document.mimeType.contains('powerpoint')) return Icons.slideshow_outlined;
    if (document.mimeType.contains('zip')) return Icons.folder_zip_outlined;
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        onTap: () => _open(context),
        child: Row(
          children: [
            Icon(_icon, size: 22, color: AppColors.indigo600),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(document.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                  const SizedBox(height: 2),
                  Text(
                    '${formatFileSize(document.size)}${document.createdAt != null ? ' · ${DateFormat('d MMM yyyy').format(document.createdAt!)}' : ''}',
                    style: const TextStyle(color: AppColors.slate500, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            IconButton(icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.rose500), onPressed: () => _delete(context, ref)),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context) {
    if (document.isImage) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ImagePreviewScreen(title: document.title, imageUrl: document.url)));
    } else {
      launchUrl(Uri.parse(document.url), mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showConfirmDialog(context, title: 'Delete this document?', message: 'This action cannot be undone.');
    if (!confirmed) return;
    try {
      await ref.read(documentsApiProvider).delete(document.id);
      ref.invalidate(documentsProvider((kind, refId)));
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}
