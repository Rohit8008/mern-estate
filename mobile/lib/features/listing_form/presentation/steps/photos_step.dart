import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/errors/app_failure.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../domain/listing_draft.dart';
import '../../listing_form_providers.dart';

const _maxPhotos = 6;

class PhotosStep extends ConsumerStatefulWidget {
  const PhotosStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  ConsumerState<PhotosStep> createState() => _PhotosStepState();
}

class _PhotosStepState extends ConsumerState<PhotosStep> {
  bool _uploading = false;
  String? _error;

  Future<void> _pickAndUpload(ImageSource source) async {
    final remaining = _maxPhotos - widget.draft.imageUrls.length;
    if (remaining <= 0) return;

    final picker = ImagePicker();
    final List<XFile> picked;
    if (source == ImageSource.gallery) {
      picked = await picker.pickMultiImage(limit: remaining, imageQuality: 85);
    } else {
      final single = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
      picked = single != null ? [single] : [];
    }
    if (picked.isEmpty) return;

    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final files = <(String, Uint8List)>[];
      for (final file in picked.take(remaining)) {
        files.add((file.name, await file.readAsBytes()));
      }
      final urls = await ref.read(listingFormApiProvider).uploadImages(files);
      widget.draft.update(() => widget.draft.imageUrls = [...widget.draft.imageUrls, ...urls]);
    } on AppFailure catch (f) {
      setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _remove(int index) {
    widget.draft.update(() {
      final updated = [...widget.draft.imageUrls]..removeAt(index);
      widget.draft.imageUrls = updated;
    });
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.draft.imageUrls;
    final canAddMore = images.length < _maxPhotos;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text('${images.length}/$_maxPhotos photos', style: const TextStyle(color: AppColors.slate500, fontSize: 12.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpacing.md),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: AppSpacing.sm,
          crossAxisSpacing: AppSpacing.sm,
          children: [
            for (var i = 0; i < images.length; i++)
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: CachedNetworkImage(imageUrl: images[i], fit: BoxFit.cover, placeholder: (c, u) => const ColoredBox(color: AppColors.slate100)),
                    ),
                  ),
                  Positioned(
                    top: 2,
                    right: 2,
                    child: GestureDetector(
                      onTap: () => _remove(i),
                      child: const CircleAvatar(radius: 11, backgroundColor: Colors.black54, child: Icon(Icons.close_rounded, size: 14, color: AppColors.white)),
                    ),
                  ),
                ],
              ),
            if (canAddMore && !_uploading)
              InkWell(
                onTap: () => _showSourceSheet(context),
                borderRadius: BorderRadius.circular(AppRadius.md),
                child: const DottedAddTile(),
              ),
            if (_uploading)
              const AspectRatio(aspectRatio: 1, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 12.5)),
        ],
        const SizedBox(height: AppSpacing.xl),
        const Text('Photos help listings get noticed faster — add at least one if you can.', style: TextStyle(color: AppColors.slate400, fontSize: 12)),
      ],
    );
  }

  void _showSourceSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from gallery'), onTap: () {
              Navigator.of(context).pop();
              _pickAndUpload(ImageSource.gallery);
            }),
            ListTile(leading: const Icon(Icons.camera_alt_outlined), title: const Text('Take a photo'), onTap: () {
              Navigator.of(context).pop();
              _pickAndUpload(ImageSource.camera);
            }),
          ],
        ),
      ),
    );
  }
}

class DottedAddTile extends StatelessWidget {
  const DottedAddTile({super.key});

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(AppRadius.md), border: Border.all(color: AppColors.slate300, width: 1.5)),
        child: const Icon(Icons.add_a_photo_outlined, color: AppColors.slate400),
      ),
    );
  }
}
