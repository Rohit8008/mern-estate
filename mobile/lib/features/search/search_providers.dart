import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/search_api.dart';

final searchApiProvider = Provider<SearchApi>((ref) => SearchApi(ref.watch(apiClientProvider).dio));
