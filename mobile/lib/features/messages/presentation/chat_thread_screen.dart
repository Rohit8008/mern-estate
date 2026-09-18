import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../domain/chat_user.dart';
import '../messages_providers.dart';

class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({super.key, required this.otherUser});
  final ChatUser otherUser;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _inputController = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Best-effort — no need to block the thread from opening on this.
    ref.read(messagesApiProvider).markRead(widget.otherUser.id).catchError((_) {});
  }

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final content = _inputController.text.trim();
    if (content.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(messagesApiProvider).send(receiverId: widget.otherUser.id, content: content);
      _inputController.clear();
      ref.invalidate(threadProvider(widget.otherUser.id));
      ref.invalidate(conversationsProvider);
    } on AppFailure catch (f) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final threadAsync = ref.watch(threadProvider(widget.otherUser.id));
    final myId = ref.watch(authControllerProvider).user?.id;

    return Scaffold(
      appBar: AppBar(title: Text(widget.otherUser.displayName)),
      body: Column(
        children: [
          Expanded(
            child: threadAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(title: 'Unable to load messages', onRetry: () => ref.invalidate(threadProvider(widget.otherUser.id))),
              data: (messages) => messages.isEmpty
                  ? const AppEmptyState(icon: Icons.chat_bubble_outline_rounded, title: 'No messages yet', message: 'Say hello to start the conversation.')
                  : ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final message = messages[messages.length - 1 - index];
                        final isMine = message.senderId == myId;
                        return Align(
                          alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.75),
                            decoration: BoxDecoration(
                              color: isMine ? AppColors.indigo600 : AppColors.slate100,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(message.content, style: TextStyle(color: isMine ? AppColors.white : AppColors.slate900, fontSize: 14)),
                                const SizedBox(height: 3),
                                Text(DateFormat('h:mm a').format(message.createdAt), style: TextStyle(color: isMine ? AppColors.white.withOpacity(0.7) : AppColors.slate400, fontSize: 10.5)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Expanded(
                    child: AppTextField(hint: 'Message…', controller: _inputController, onSubmitted: (_) => _send()),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    style: IconButton.styleFrom(backgroundColor: AppColors.indigo600),
                    icon: const Icon(Icons.send_rounded, color: AppColors.white, size: 18),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
