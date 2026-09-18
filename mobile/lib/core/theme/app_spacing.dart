/// Spacing and radius scale — matches the Tailwind steps the web CRM uses
/// (p-1=4, p-2=8, p-3=12, p-4=16, p-5=20, p-6=24, p-8=32) so density feels
/// identical when a screen has a direct desktop counterpart.
abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
}

/// rounded-md/lg/xl/2xl/full from Tailwind's default scale.
abstract final class AppRadius {
  static const sm = 6.0;
  static const md = 8.0;
  static const lg = 12.0;
  static const xl = 16.0;
  static const full = 999.0;
}
