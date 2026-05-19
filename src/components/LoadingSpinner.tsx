export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="relative w-16 h-16">
        {/* Outer circle */}
        <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
        
        {/* Spinner */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-500 border-r-red-500 animate-spin"></div>
        
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
