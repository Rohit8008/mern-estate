import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/notes_api.dart';

final notesApiProvider = Provider<NotesApi>((ref) => NotesApi(ref.watch(apiClientProvider).dio));
