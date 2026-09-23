import 'package:intl/intl.dart';

/// One place for how the app writes money, counts and dates.
///
/// Each screen built its own `NumberFormat`, and KPI cards printed full
/// rupee amounts ("₹2,13,45,000") that a phone-width card cut to "₹2,13,4…".
/// Cards use [moneyCompact] (lakh/crore, like the web app's
/// formatCompactCurrency); lists and detail screens use [money].
abstract final class Fmt {
  static final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  static final _count = NumberFormat.decimalPattern('en_IN');

  static String money(num? value) => _money.format(value ?? 0);

  static String count(num? value) => _count.format(value ?? 0);

  /// ₹2.13 Cr, ₹68 L, ₹78.5K, ₹950 — a no-break space keeps the unit with
  /// the number when text wraps.
  static String moneyCompact(num? value) {
    final v = (value ?? 0).toDouble();
    final abs = v.abs();
    String trim(double n) {
      final s = n.toStringAsFixed(2);
      return s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;
    }
    if (abs >= 1e7) return '₹${trim(v / 1e7)} Cr';
    if (abs >= 1e5) return '₹${trim(v / 1e5)} L';
    if (abs >= 1e3) return '₹${trim(v / 1e3)}K';
    return money(v);
  }

  /// 23 Sept 2026 — day-month order, as the web app shows dates.
  static String date(DateTime? d) => d == null ? '' : DateFormat('d MMM yyyy').format(d.toLocal());

  /// Wednesday, 23 September
  static String longDay(DateTime d) => DateFormat('EEEE, d MMMM').format(d.toLocal());

  /// "Just now", "5m", "3h", "Yesterday", "Mon", then "23 Sep" — for lists
  /// where the exact time matters less than how recent it is.
  static String ago(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final local = d.toLocal();
    final n = now ?? DateTime.now();
    final diff = n.difference(local);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m';
    final today = DateTime(n.year, n.month, n.day);
    final day = DateTime(local.year, local.month, local.day);
    final days = today.difference(day).inDays;
    if (days == 0) return DateFormat('h:mm a').format(local);
    if (days == 1) return 'Yesterday';
    if (days < 7) return DateFormat('EEE').format(local);
    if (local.year == n.year) return DateFormat('d MMM').format(local);
    return DateFormat('d MMM yyyy').format(local);
  }

  /// A listing's price, or "Price on request" for the importer's placeholder
  /// 1 and the form's 0 — the website's rule, so both read the same.
  static String price(num? value, {bool compact = false}) {
    if (value == null || value <= 1) return 'Price on request';
    return compact ? moneyCompact(value) : money(value);
  }
}
