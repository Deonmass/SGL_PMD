import { Lock } from 'lucide-react';

interface AccessDeniedProps {
  message?: string;
}

function AccessDenied({ message = 'Vous n\'avez pas les permissions nécessaires pour accéder à cette page.' }: AccessDeniedProps) {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Lock size={64} className="mx-auto text-red-500 mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Accès Refusé</h1>
        <p className="text-gray-600 text-lg mb-8">{message}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
        >
          Retour au dashboard
        </button>
      </div>
    </div>
  );
}

export default AccessDenied;
