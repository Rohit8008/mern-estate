import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Full-screen, pinch-to-zoom viewer for image documents (jpg/png) — the
/// one document type that's worth rendering inline instead of handing off
/// to an external viewer.
class ImagePreviewScreen extends StatelessWidget {
  const ImagePreviewScreen({super.key, required this.title, required this.imageUrl});

  final String title;
  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: AppColors.white,
        title: Text(title, style: const TextStyle(color: AppColors.white)),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 0.8,
          maxScale: 4,
          child: CachedNetworkImage(
            imageUrl: imageUrl,
            fit: BoxFit.contain,
            placeholder: (context, url) => const CircularProgressIndicator(),
            errorWidget: (context, url, error) => const Icon(Icons.broken_image_outlined, color: AppColors.slate400, size: 48),
          ),
        ),
      ),
    );
  }
}
