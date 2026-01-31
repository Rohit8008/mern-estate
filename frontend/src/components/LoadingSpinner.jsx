import PropTypes from 'prop-types';

const LoadingSpinner = ({ 
  size = 'md', 
  color = 'indigo', 
  text = 'Loading...', 
  showText = true,
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const colorClasses = {
    indigo: 'text-indigo-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
    white: 'text-white'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center space-y-2">
        <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-${color}-600 ${sizeClasses[size]} ${colorClasses[color]}`}></div>
        {showText && text && (
          <p className={`text-sm ${colorClasses[color]} font-medium`}>{text}</p>
        )}
      </div>
    </div>
  );
};

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  color: PropTypes.oneOf(['indigo', 'blue', 'green', 'red', 'gray', 'white']),
  text: PropTypes.string,
  showText: PropTypes.bool,
  className: PropTypes.string,
};

export default LoadingSpinner;
