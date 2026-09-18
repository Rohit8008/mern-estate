import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/documents_api.dart';
import 'domain/crm_document.dart';

final documentsApiProvider = Provider<DocumentsApi>((ref) => DocumentsApi(ref.watch(apiClientProvider).dio));

/// Keyed by (kind, refId) — a Dart record, which has structural equality for
/// free, so this works directly as a family argument.
final documentsProvider = FutureProvider.autoDispose.family<List<CrmDocument>, (String kind, String refId)>((ref, args) {
  return ref.watch(documentsApiProvider).list(kind: args.$1, refId: args.$2);
});
