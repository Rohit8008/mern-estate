import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/listing_form_api.dart';

final listingFormApiProvider = Provider<ListingFormApi>((ref) => ListingFormApi(ref.watch(apiClientProvider).dio));
