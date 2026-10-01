import 'package:flutter/widgets.dart';

/// Height for a horizontal row of filter chips. A horizontal ListView forces
/// every chip to the row's height, so a fixed 40 clipped chip labels under a
/// larger system font; this grows with the text (capped, so the row can't eat
/// the list below it) and never drops under 40 — chips stay ≥36dp to tap.
double filterChipRowHeight(BuildContext context) =>
    40 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6).toDouble();
