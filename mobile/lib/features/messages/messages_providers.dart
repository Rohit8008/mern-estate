import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/messages_api.dart';
import 'domain/chat_message.dart';

final messagesApiProvider = Provider<MessagesApi>((ref) => MessagesApi(ref.watch(apiClientProvider).dio));

class ConversationsController extends AsyncNotifier<List<Conversation>> {
  @override
  Future<List<Conversation>> build() => ref.watch(messagesApiProvider).conversations();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final conversationsProvider = AsyncNotifierProvider<ConversationsController, List<Conversation>>(ConversationsController.new);

final threadProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, otherId) {
  return ref.watch(messagesApiProvider).thread(otherId);
});
