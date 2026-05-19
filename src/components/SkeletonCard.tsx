import React from 'react';

interface SkeletonCardProps {
  height?: string;
  className?: string;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ height = 'h-32', className = '' }) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded w-8"></div>
        </div>
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonCard;
