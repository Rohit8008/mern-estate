import { cn } from '../../utils/cn';

export default function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300',
        className
      )}
      {...props}
    />
  );
}
