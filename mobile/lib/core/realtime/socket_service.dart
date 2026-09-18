import 'package:socket_io_client/socket_io_client.dart' as io;

import '../network/api_client.dart';

/// Thin wrapper over socket_io_client — connects once per session to the
/// same events the web app listens to (message:new, conversations:update,
/// listing:update, owners:changed). See ApiClient.socketCookieHeaders for
/// why the connection needs an explicit Cookie header on native platforms.
class SocketService {
  SocketService(this._apiClient, this._baseUrl);

  final ApiClient _apiClient;
  final String _baseUrl;
  io.Socket? _socket;

  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return;
    final headers = await _apiClient.socketCookieHeaders(_baseUrl);

    final options = io.OptionBuilder()
        .setTransports(['websocket'])
        .setExtraHeaders(headers)
        .enableReconnection()
        .build();

    _socket = io.io(_baseUrl, options);
  }

  void on(String event, void Function(dynamic data) handler) => _socket?.on(event, handler);

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
