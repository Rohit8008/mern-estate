import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../listing_form/presentation/listing_form_screen.dart';
import '../domain/note.dart';
import '../notes_providers.dart';

/// Quick-capture: jot a text note, act on it later (play back a voice note
/// recorded on the web, turn a note into a property). Notes are private to the
/// user. On-device voice recording is a fast-follow.
class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key});

  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  final _text = TextEditingController();
  final _player = AudioPlayer();

  List<Note>? _notes;
  String? _error;
  bool _saving = false;
  String? _playingId;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playingId = null);
    });
    _load();
  }

  @override
  void dispose() {
    _text.dispose();
    _player.dispose();
    super.dispose();
  }

  String _resolve(String url) => url.startsWith('http') ? url : '${Env.apiBaseUrl}$url';

  Future<void> _load() async {
    try {
      final notes = await ref.read(notesApiProvider).list();
      if (mounted) setState(() { _notes = notes; _error = null; });
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    }
  }

  Future<void> _saveText() async {
    final body = _text.text.trim();
    if (body.isEmpty || _saving) return;
    setState(() => _saving = true);
    try {
      final note = await ref.read(notesApiProvider).createText(body);
      _text.clear();
      if (mounted) setState(() => _notes = [note, ...?_notes]);
    } on AppFailure catch (f) {
      _snack(f.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _togglePlay(Note note) async {
    if (_playingId == note.id) {
      await _player.stop();
      setState(() => _playingId = null);
      return;
    }
    try {
      await _player.stop();
      await _player.play(UrlSource(_resolve(note.audioUrl)));
      setState(() => _playingId = note.id);
    } catch (_) {
      _snack("Couldn't play this note.");
    }
  }

  Future<void> _delete(Note note) async {
    final ok = await showConfirmDialog(context,
        title: 'Delete this note?', message: 'This cannot be undone.', confirmLabel: 'Delete');
    if (!ok) return;
    setState(() => _notes = _notes?.where((n) => n.id != note.id).toList());
    try {
      await ref.read(notesApiProvider).delete(note.id);
    } on AppFailure catch (f) {
      _snack(f.message);
      _load();
    }
  }

  void _snack(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final notes = _notes;
    return Scaffold(
      appBar: AppBar(title: const Text('Notes')),
      body: Column(
        children: [
          _composer(),
          const Divider(height: 1),
          Expanded(
            child: notes == null
                ? (_error != null
                    ? AppErrorState(title: 'Could not load notes', message: _error, onRetry: _load)
                    : const AppPageLoader())
                : notes.isEmpty
                    ? const AppEmptyState(
                        icon: Icons.sticky_note_2_outlined,
                        title: 'No notes yet',
                        message: 'Jot a quick note above to act on it later.')
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          itemCount: notes.length,
                          separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                          itemBuilder: (_, i) => _noteCard(notes[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _composer() {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        children: [
          AppTextField(
            controller: _text,
            hint: "Type a note… e.g. '2BHK Sector 21, owner Raj 98xxxx, wants ₹45L'",
            maxLines: 3,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(label: 'Save note', onPressed: _saving ? null : _saveText, loading: _saving, expand: true),
        ],
      ),
    );
  }

  Widget _noteCard(Note note) {
    final playing = _playingId == note.id;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (note.text.isNotEmpty)
            Text(note.text, style: const TextStyle(fontSize: 14, color: AppColors.slate800)),
          if (note.hasAudio) ...[
            if (note.text.isNotEmpty) const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                IconButton(
                  onPressed: () => _togglePlay(note),
                  icon: Icon(playing ? Icons.pause_circle_filled_rounded : Icons.play_circle_fill_rounded,
                      color: AppColors.indigo600, size: 34),
                ),
                Text(note.audioDuration > 0 ? '0:${note.audioDuration.toString().padLeft(2, '0')}' : 'Voice note',
                    style: const TextStyle(fontSize: 13, color: AppColors.slate600)),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Text(_when(note.createdAt), style: const TextStyle(fontSize: 11, color: AppColors.slate400)),
              const Spacer(),
              if (note.createdListingId != null)
                const _Chip(icon: Icons.check_circle_outline, label: 'Property created', color: AppColors.emerald600)
              else
                TextButton.icon(
                  onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const ListingFormScreen())),
                  icon: const Icon(Icons.home_work_outlined, size: 18),
                  label: const Text('Create property'),
                ),
              IconButton(
                onPressed: () => _delete(note),
                icon: const Icon(Icons.delete_outline_rounded, color: AppColors.slate400, size: 20),
                tooltip: 'Delete',
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _when(DateTime? ts) {
    if (ts == null) return '';
    final l = ts.toLocal();
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final hh = l.hour % 12 == 0 ? 12 : l.hour % 12;
    final ap = l.hour < 12 ? 'am' : 'pm';
    return '${l.day} ${m[l.month - 1]}, $hh:${l.minute.toString().padLeft(2, '0')}$ap';
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
        ]),
      );
}
