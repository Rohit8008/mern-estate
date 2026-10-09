import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../../core/config/env.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../listing_form/presentation/listing_form_screen.dart';
import '../domain/note.dart';
import '../notes_providers.dart';

/// Quick-capture: jot a text note or record a voice memo, act on it later
/// (play it back, turn a note into a property). Notes are private to the user.
class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key});

  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  final _text = TextEditingController();
  final _player = AudioPlayer();
  final _recorder = AudioRecorder();

  List<Note>? _notes;
  String? _error;
  bool _saving = false;
  String? _playingId;

  // Recording state.
  bool _recording = false;
  bool _uploading = false;
  int _recSeconds = 0;
  Timer? _recTimer;
  String? _recPath;

  static const _maxRecordSeconds = 300; // 5 minutes — plenty for a memo.

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
    _recTimer?.cancel();
    _recorder.dispose();
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

  Future<void> _startRecording() async {
    if (_recording || _uploading) return;
    try {
      if (!await _recorder.hasPermission()) {
        _snack('Microphone access is needed to record a voice note.');
        return;
      }
      // Stop any playback so the mic isn't competing with the speaker.
      if (_playingId != null) {
        await _player.stop();
        if (mounted) setState(() => _playingId = null);
      }
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/voice-note-${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
      _recPath = path;
      _recSeconds = 0;
      setState(() => _recording = true);
      _recTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _recSeconds++);
        if (_recSeconds >= _maxRecordSeconds) _stopRecording();
      });
    } catch (_) {
      _snack("Couldn't start recording.");
      _recTimer?.cancel();
      if (mounted) setState(() => _recording = false);
    }
  }

  /// Stop, upload and save the note. A too-short tap is discarded quietly.
  Future<void> _stopRecording() async {
    if (!_recording) return;
    _recTimer?.cancel();
    final seconds = _recSeconds;
    setState(() => _recording = false);
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      _snack("Couldn't finish recording.");
      return;
    }
    path ??= _recPath;
    if (path == null || seconds < 1) {
      _snack('Recording too short — hold to record a voice note.');
      _cleanupRecFile(path);
      return;
    }
    setState(() => _uploading = true);
    try {
      final api = ref.read(notesApiProvider);
      final url = await api.uploadAudio(path);
      final note = await api.createVoice(audioUrl: url, durationSec: seconds);
      if (mounted) setState(() => _notes = [note, ...?_notes]);
    } on AppFailure catch (f) {
      _snack(f.message);
    } finally {
      _cleanupRecFile(path);
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _cancelRecording() async {
    if (!_recording) return;
    _recTimer?.cancel();
    setState(() => _recording = false);
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {/* nothing to save anyway */}
    _cleanupRecFile(path ?? _recPath);
  }

  void _cleanupRecFile(String? path) {
    if (path == null) return;
    try {
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
    } catch (_) {/* best-effort */}
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
      child: _recording ? _recordingBar() : _textComposer(),
    );
  }

  Widget _textComposer() {
    return Column(
      children: [
        AppTextField(
          controller: _text,
          hint: "Type a note… e.g. '2BHK Sector 21, owner Raj 98xxxx, wants ₹45L'",
          maxLines: 3,
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: AppButton(label: 'Save note', onPressed: _saving ? null : _saveText, loading: _saving, expand: true),
            ),
            const SizedBox(width: AppSpacing.sm),
            _MicButton(busy: _uploading, onTap: _startRecording),
          ],
        ),
        if (_uploading)
          const Padding(
            padding: EdgeInsets.only(top: AppSpacing.sm),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                SizedBox(width: AppSpacing.sm),
                Text('Saving voice note…', style: TextStyle(fontSize: 12.5, color: AppColors.slate500)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _recordingBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.rose50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.rose200),
      ),
      child: Row(
        children: [
          const _RecDot(),
          const SizedBox(width: AppSpacing.sm),
          Text('Recording  ${_fmtDuration(_recSeconds)}',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.rose600)),
          const Spacer(),
          TextButton(onPressed: _cancelRecording, child: const Text('Cancel')),
          const SizedBox(width: AppSpacing.xs),
          FilledButton.icon(
            onPressed: _stopRecording,
            icon: const Icon(Icons.stop_rounded, size: 18),
            label: const Text('Stop'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.rose600),
          ),
        ],
      ),
    );
  }

  static String _fmtDuration(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

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
                Text(note.audioDuration > 0 ? _fmtDuration(note.audioDuration) : 'Voice note',
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

/// Tap to start a voice note. Disabled while a previous recording uploads.
class _MicButton extends StatelessWidget {
  const _MicButton({required this.onTap, required this.busy});
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Record a voice note',
      child: Material(
        color: AppColors.indigo600,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: busy ? null : onTap,
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: busy ? AppColors.slate400 : AppColors.indigo600,
            ),
            child: const Icon(Icons.mic_rounded, color: AppColors.white, size: 22),
          ),
        ),
      ),
    );
  }
}

/// A pulsing red dot — the "live" cue while recording.
class _RecDot extends StatefulWidget {
  const _RecDot();
  @override
  State<_RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<_RecDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 1, end: 0.25).animate(_c),
      child: Container(
        width: 12,
        height: 12,
        decoration: const BoxDecoration(color: AppColors.rose600, shape: BoxShape.circle),
      ),
    );
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
