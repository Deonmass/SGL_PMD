import { CheckSquare } from 'lucide-react';

function Header() {
  return (
    <header className="bg-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckSquare size={32} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">SGL PMD</h1>
            <p className="text-sm text-gray-600">Gestionnaire de Projet</p>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
            v0.1.0
          </span>
        </div>
      </div>
    </header>
  );
}

export default Header;
