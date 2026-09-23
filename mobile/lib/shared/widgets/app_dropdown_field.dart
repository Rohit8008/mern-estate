import 'package:flutter/material.dart';


/// Labeled dropdown matching AppTextField's label placement — used by every
/// enum-backed field (status, priority, stage, type…) across create/edit
/// forms.
class AppDropdownField<T extends Object> extends StatelessWidget {
  const AppDropdownField({super.key, required this.label, required this.value, required this.items, required this.onChanged});

  final String label;
  final T value;
  final Map<T, String> items;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        DropdownButtonFormField<T>(
          value: value,
          // Without isExpanded, the dropdown sizes its closed-state Row to
          // the *longest item's* natural width regardless of the field's
          // own width — invisible at wide test/desktop widths, but a real
          // overflow once two of these sit side by side on an actual phone
          // (~170px each). isExpanded + ellipsis is the standard fix.
          isExpanded: true,
          items: [
            for (final entry in items.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ],
    );
  }
}
