import { cn } from '../../utils/cn';

export default function Badge({ variant = 'default', className, ...props }) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    info: 'bg-blue-100 text-blue-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-900',
    danger: 'bg-rose-100 text-rose-900',
    purple: 'bg-purple-100 text-purple-800',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}
