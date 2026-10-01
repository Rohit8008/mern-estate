/// Deliberately loose: catches the typo ("name@gmail", a stray space) without
/// rejecting the odd-but-valid addresses a strict RFC regex trips over. The
/// server remains the authority.
bool looksLikeEmail(String value) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim());

/// Field-level email error, or null. Empty is allowed — email is optional on
/// every CRM form that uses this.
String? emailError(String value) =>
    value.trim().isEmpty || looksLikeEmail(value) ? null : 'Enter a valid email address.';
