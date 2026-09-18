import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
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
    final name = user?.displayName ?? 'Unknown user';

    return AppCard(
      onTap: () {
        if (user == null) return;
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatThreadScreen(otherUser: user)));
      },
      child: Row(
        children: [
          CircleAvatar(radius: 20, backgroundColor: AppColors.slate200, child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(color: AppColors.slate700, fontWeight: FontWeight.w700))),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    Text(DateFormat('MMM d').format(conversation.lastMessage.createdAt), style: const TextStyle(color: AppColors.slate400, fontSize: 11.5)),
                  ],
                ),
                const SizedBox(height: 2),
                Text(conversation.lastMessage.content, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
              ],
            ),
          ),
          if (conversation.unread > 0) ...[
            const SizedBox(width: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: AppColors.indigo600, borderRadius: BorderRadius.circular(999)),
              child: Text('${conversation.unread}', style: const TextStyle(color: AppColors.white, fontSize: 11, fontWeight: FontWeight.w700)),
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
                          leading: CircleAvatar(radius: 18, backgroundColor: AppColors.slate200, child: Text(user.displayName[0].toUpperCase())),
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
