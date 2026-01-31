import Button from './Button';
import { cn } from '../../utils/cn';

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
  icon,
}) {
  return (
    <div className={cn('text-center py-12', className)}>
      {icon ? (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-600">
          {icon}
        </div>
      ) : null}
      <h3 className='text-xl font-semibold text-gray-900 mb-2'>{title}</h3>
      {description ? <p className='text-gray-600 max-w-md mx-auto'>{description}</p> : null}
      {actionLabel && onAction ? (
        <div className='mt-6 flex justify-center'>
          <Button type='button' variant='secondary' onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
