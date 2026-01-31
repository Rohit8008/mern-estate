import { cn } from '../../utils/cn';

export default function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    primary:
      'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5',
    secondary:
      'bg-white text-gray-800 border border-gray-200 shadow-sm hover:shadow-md hover:bg-gray-50',
    ghost: 'bg-transparent text-gray-800 hover:bg-gray-100',
    destructive:
      'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5',
    success:
      'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5',
  };

  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <Comp
      className={cn(base, variants[variant] || variants.primary, sizes[size] || sizes.md, className)}
      {...props}
    />
  );
}
