import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/chat_message.dart';
import '../domain/chat_user.dart';
import '../messages_providers.dart';
import 'chat_thread_screen.dart';

class MessagesListScreen extends ConsumerWidget {
  const MessagesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conversationsAsync = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        actions: [IconButton(icon: const Icon(Icons.add_comment_outlined), onPressed: () => _openNewMessageSheet(context, ref))],
      ),
      body: conversationsAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(title: 'Unable to load messages', onRetry: () => ref.read(conversationsProvider.notifier).refresh()),
        data: (conversations) => conversations.isEmpty
            ? AppEmptyState(
                icon: Icons.chat_bubble_outline_rounded,
                title: 'No conversations yet',
                actionLabel: 'Start a conversation',
                onAction: () => _openNewMessageSheet(context, ref),
              )
            : RefreshIndicator(
                onRefresh: () => ref.read(conversationsProvider.notifier).refresh(),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.xxxl),
                  itemCount: conversations.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (context, index) => _ConversationRow(conversation: conversations[index]),
                ),
              ),
      ),
    );
  }

  Future<void> _openNewMessageSheet(BuildContext context, WidgetRef ref) async {
    final picked = await showModalBottomSheet<ChatUser>(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _NewMessageSheet(),
    );
    if (picked != null && context.mounted) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatThreadScreen(otherUser: picked)));
    }
  }
}

class _ConversationRow extends StatelessWidget {
  const _ConversationRow({required this.conversation});
  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final user = conversation.otherUser;
    final name = (user?.displayName.trim().isNotEmpty ?? false) ? user!.displayName : 'Former team member';
    final unread = conversation.unread > 0;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return AppCard(
      onTap: () {
        if (user == null) return;
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatThreadScreen(otherUser: user)));
      },
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: dark ? AppColors.slate700 : AppColors.slate200,
            child: Text(name[0].toUpperCase(), style: TextStyle(color: dark ? AppColors.slate100 : AppColors.slate700, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                    const SizedBox(width: AppSpacing.sm),
                    Text(Fmt.ago(conversation.lastMessage.createdAt),
                        style: TextStyle(color: unread ? AppColors.indigo600 : AppColors.slate400, fontSize: 11.5, fontWeight: unread ? FontWeight.w700 : FontWeight.w400)),
                  ],
                ),
                const SizedBox(height: 2),
                Text(conversation.lastMessage.content.replaceAll('\n', ' '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: unread ? null : AppColors.slate500, fontSize: 12.5, fontWeight: unread ? FontWeight.w600 : FontWeight.w400)),
              ],
            ),
          ),
          if (conversation.unread > 0) ...[
            const SizedBox(width: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: AppColors.indigo600, borderRadius: BorderRadius.circular(999)),
              child: Text(conversation.unread > 99 ? '99+' : '${conversation.unread}', style: const TextStyle(color: AppColors.white, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ],
        ],
      ),
    );
  }
}

class _NewMessageSheet extends ConsumerStatefulWidget {
  const _NewMessageSheet();

  @override
  ConsumerState<_NewMessageSheet> createState() => _NewMessageSheetState();
}

class _NewMessageSheetState extends ConsumerState<_NewMessageSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<ChatUser> _results = [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _loading = true);
      try {
        final results = await ref.read(messagesApiProvider).searchUsers(value.trim());
        if (mounted) setState(() => _results = results);
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) => SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: AppTextField(hint: 'Search people by name or email…', prefixIcon: Icons.search_rounded, controller: _controller, onChanged: _onChanged, autofocus: true),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty
                  ? const Center(child: Text('Search for someone to message', style: TextStyle(color: AppColors.slate400)))
                  : ListView.builder(
                      controller: scrollController,
                      itemCount: _results.length,
                      itemBuilder: (context, index) {
                        final user = _results[index];
                        return ListTile(
                          leading: CircleAvatar(radius: 18, backgroundColor: AppColors.slate200, child: Text(user.displayName.isEmpty ? '?' : user.displayName[0].toUpperCase())),
                          title: Text(user.displayName),
                          onTap: () => Navigator.of(context).pop(user),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
