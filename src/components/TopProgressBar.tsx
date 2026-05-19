interface TopProgressBarProps {
  isLoading: boolean;
}

export default function TopProgressBar({ isLoading }: TopProgressBarProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-red-600 z-50 animate-pulse">
      <div className="absolute inset-0 bg-red-600 opacity-75 animate-loading-progress"></div>
    </div>
  );
}
