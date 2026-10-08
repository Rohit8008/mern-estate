import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/note.dart';

/// Quick-capture notes (text + voice). Mirrors the web /api/notes endpoints.
/// Voice is uploaded to the backend audio endpoint first, then the returned URL
/// is saved on the note.
class NotesApi {
  NotesApi(this._dio);

  final Dio _dio;

  Future<List<Note>> list() async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/notes');
      return (res.data ?? const [])
          .map((e) => Note.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Note> createText(String text) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/notes', data: {'text': text});
      return Note.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// Uploads a recorded audio file and returns the stored (relative) URL.
  Future<String> uploadAudio(String filePath) async {
    try {
      final form = FormData.fromMap({
        'audio': await MultipartFile.fromFile(filePath, filename: 'voice-note.m4a'),
      });
      final res = await _dio.post<Map<String, dynamic>>('/api/upload/audio', data: form);
      final url = res.data?['url'] as String?;
      if (url == null || url.isEmpty) {
        throw const AppFailure(message: "That recording couldn't be uploaded.", type: AppFailureType.unknown);
      }
      return url;
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Note> createVoice({required String audioUrl, required int durationSec}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/notes',
        data: {'audioUrl': audioUrl, 'audioDuration': durationSec},
      );
      return Note.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/notes/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
