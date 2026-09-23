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
    _markRead();
  }

  /// Best-effort — no need to block the thread from opening on this. The
  /// list is refreshed after, so its unread badge clears on the way back.
  void _markRead() {
    ref.read(messagesApiProvider).markRead(widget.otherUser.id).then((_) {
      if (mounted) ref.invalidate(conversationsProvider);
    }).catchError((_) {});
  }

  String _dayLabel(DateTime d) {
    final local = d.toLocal();
    final now = DateTime.now();
    final days = DateTime(now.year, now.month, now.day).difference(DateTime(local.year, local.month, local.day)).inDays;
    if (days == 0) return 'Today';
    if (days == 1) return 'Yesterday';
    return DateFormat(local.year == now.year ? 'EEE, d MMM' : 'd MMM yyyy').format(local);
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    // A message that arrives while this is open is read by being seen.
    ref.listen(threadProvider(widget.otherUser.id), (prev, next) {
      final before = prev?.valueOrNull?.length ?? 0;
      final after = next.valueOrNull?.length ?? 0;
      if (prev?.hasValue == true && after > before) _markRead();
    });

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
                        final i = messages.length - 1 - index;
                        final message = messages[i];
                        final isMine = message.senderId == myId;
                        final prevMsg = i > 0 ? messages[i - 1] : null;
                        final c = message.createdAt.toLocal();
                        final p = prevMsg?.createdAt.toLocal();
                        final newDay = p == null || p.year != c.year || p.month != c.month || p.day != c.day;
                        final bubble = Align(
                          alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.75),
                            decoration: BoxDecoration(
                              color: isMine ? AppColors.indigo600 : (dark ? AppColors.slate800 : AppColors.slate100),
                              borderRadius: BorderRadius.only(
                                topLeft: const Radius.circular(14),
                                topRight: const Radius.circular(14),
                                bottomLeft: Radius.circular(isMine ? 14 : 4),
                                bottomRight: Radius.circular(isMine ? 4 : 14),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SelectableText(message.content, style: TextStyle(color: isMine || dark ? AppColors.white : AppColors.slate900, fontSize: 14, height: 1.35)),
                                const SizedBox(height: 3),
                                Text(DateFormat('h:mm a').format(message.createdAt.toLocal()), style: TextStyle(color: isMine ? AppColors.white.withOpacity(0.7) : AppColors.slate400, fontSize: 10.5)),
                              ],
                            ),
                          ),
                        );
                        if (!newDay) return bubble;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: dark ? AppColors.slate800 : AppColors.slate100,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(_dayLabel(message.createdAt), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.slate500)),
                                ),
                              ),
                            ),
                            bubble,
                          ],
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
