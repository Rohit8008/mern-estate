import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

/// Overridden with a real, already-initialized instance in main() before
/// runApp — ApiClient.create() is async (it touches disk for the cookie
/// jar), so it can't be constructed lazily inside a plain Provider.
final apiClientProvider = Provider<ApiClient>((ref) {
  throw UnimplementedError('apiClientProvider must be overridden in main() with an initialized ApiClient');
});
