import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../properties/domain/listing.dart';
import '../../properties/properties_providers.dart';
import '../domain/listing_draft.dart';
import '../listing_form_providers.dart';
import 'steps/basics_step.dart';
import 'steps/location_step.dart';
import 'steps/owners_step.dart';
import 'steps/photos_step.dart';
import 'steps/pricing_step.dart';
import 'steps/review_step.dart';

const _stepTitles = ['Basics', 'Location', 'Pricing', 'Owners', 'Photos', 'Review'];

/// Mobile-first wizard (6 short steps) instead of the desktop's single long
/// scrolling form — see mobile_app_progress memory for why this shape.
class ListingFormScreen extends ConsumerStatefulWidget {
  const ListingFormScreen({super.key, this.existing});
  final Listing? existing;

  @override
  ConsumerState<ListingFormScreen> createState() => _ListingFormScreenState();
}

class _ListingFormScreenState extends ConsumerState<ListingFormScreen> {
  late final ListingDraft _draft = widget.existing != null ? ListingDraft.fromListing(widget.existing!) : ListingDraft.blank();
  final _pageController = PageController();
  int _stepIndex = 0;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _draft.dispose();
    _pageController.dispose();
    super.dispose();
  }

  String? _validateCurrentStep() {
    switch (_stepIndex) {
      case 0:
        return _draft.validateStep1();
      case 1:
        return _draft.validateStep2();
      case 2:
        return _draft.validateStep3();
      default:
        return null;
    }
  }

  void _goNext() {
    final error = _validateCurrentStep();
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() => _error = null);
    if (_stepIndex == _stepTitles.length - 1) {
      _submit();
      return;
    }
    _pageController.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  void _goBack() {
    if (_stepIndex == 0) {
      Navigator.of(context).pop();
      return;
    }
    _pageController.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = ref.read(listingFormApiProvider);
      final payload = _draft.toPayload();
      final saved = _draft.isEditing ? await api.update(_draft.existingId!, payload) : await api.create(payload);
      ref.invalidate(listingsControllerProvider);
      if (_draft.isEditing) ref.invalidate(listingDetailProvider(_draft.existingId!));
      if (mounted) Navigator.of(context).pop(saved);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLastStep = _stepIndex == _stepTitles.length - 1;

    return Scaffold(
      appBar: AppBar(
        title: Text(_draft.isEditing ? 'Edit Property' : 'New Property'),
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: _goBack),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(value: (_stepIndex + 1) / _stepTitles.length, minHeight: 4, backgroundColor: AppColors.slate100, color: AppColors.indigo600),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Step ${_stepIndex + 1} of ${_stepTitles.length}', style: const TextStyle(color: AppColors.slate400, fontSize: 12, fontWeight: FontWeight.w600)),
                Text(_stepTitles[_stepIndex], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ],
            ),
          ),
          Expanded(
            child: ListenableBuilder(
              listenable: _draft,
              builder: (context, _) => PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (i) => setState(() => _stepIndex = i),
                children: [
                  BasicsStep(draft: _draft),
                  LocationStep(draft: _draft),
                  PricingStep(draft: _draft),
                  OwnersStep(draft: _draft),
                  PhotosStep(draft: _draft),
                  ReviewStep(draft: _draft),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null) ...[
                    DecoratedBox(
                      decoration: BoxDecoration(color: AppColors.rose50, borderRadius: BorderRadius.circular(10)),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Text(_error!, style: const TextStyle(color: AppColors.rose700, fontSize: 13)),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  AppButton(
                    label: isLastStep ? (_draft.isEditing ? 'Save changes' : 'Create listing') : 'Continue',
                    onPressed: _submitting ? null : _goNext,
                    loading: _submitting,
                    variant: AppButtonVariant.brand,
                    expand: true,
                    size: AppButtonSize.lg,
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
