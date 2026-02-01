import React from 'react';
import { cn } from '@/lib/utils';

export function StatsCard({ title, value, icon: Icon, trend, trendValue, className, iconColor = 'text-blue-600' }) {
  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow', className)}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {trend && (
            <div className="flex items-center mt-2">
              <span className={cn('text-sm font-medium', trend === 'up' ? 'text-green-600' : 'text-red-600')}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className="text-xs text-gray-500 ml-2">vs last month</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('p-3 rounded-lg bg-opacity-10', iconColor)}>
            <Icon className={cn('w-6 h-6', iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
      </div>
    </div>
  );
}
