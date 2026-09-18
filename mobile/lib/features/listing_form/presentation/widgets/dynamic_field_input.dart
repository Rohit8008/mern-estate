import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../properties/domain/field_definition.dart';

/// Renders the right input control for a PropertyType field definition —
/// text/textarea/number/select/boolean/date — reading and writing directly
/// into the caller's propertyTypeFields map. Not server-validated (see
/// listing_draft.dart), so this only enforces `required` client-side, as a
/// courtesy, not a hard gate matching some backend rule.
class DynamicFieldInput extends StatefulWidget {
  const DynamicFieldInput({super.key, required this.field, required this.value, required this.onChanged});

  final FieldDefinition field;
  final dynamic value;
  final ValueChanged<dynamic> onChanged;

  @override
  State<DynamicFieldInput> createState() => _DynamicFieldInputState();
}

class _DynamicFieldInputState extends State<DynamicFieldInput> {
  late final _controller = TextEditingController(text: widget.value?.toString() ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _label => widget.field.required ? '${widget.field.label} *' : widget.field.label;

  @override
  Widget build(BuildContext context) {
    switch (widget.field.type) {
      case 'number':
        return AppTextField(
          label: widget.field.unit != null ? '$_label (${widget.field.unit})' : _label,
          hint: widget.field.placeholder,
          controller: _controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (v) => widget.onChanged(num.tryParse(v)),
        );

      case 'textarea':
        return AppTextField(label: _label, hint: widget.field.placeholder, controller: _controller, maxLines: 3, onChanged: widget.onChanged);

      case 'boolean':
        final boolValue = widget.value == true;
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(_label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            Switch(value: boolValue, onChanged: widget.onChanged),
          ],
        );

      case 'select':
        final current = widget.value?.toString();
        return AppDropdownField<String>(
          label: _label,
          value: (current != null && widget.field.options.contains(current)) ? current : (widget.field.options.isNotEmpty ? widget.field.options.first : ''),
          items: {for (final o in widget.field.options) o: o},
          onChanged: widget.onChanged,
        );

      case 'date':
        final date = DateTime.tryParse(widget.value?.toString() ?? '');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            const SizedBox(height: 6),
            AppButton(
              label: date != null ? DateFormat('MMM d, yyyy').format(date) : 'Select date',
              icon: Icons.calendar_today_outlined,
              variant: AppButtonVariant.secondary,
              expand: true,
              onPressed: () async {
                final picked = await showDatePicker(context: context, initialDate: date ?? DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime(2100));
                if (picked != null) widget.onChanged(picked.toIso8601String());
              },
            ),
          ],
        );

      case 'text':
      default:
        return AppTextField(label: _label, hint: widget.field.placeholder, controller: _controller, onChanged: widget.onChanged);
    }
  }
}
