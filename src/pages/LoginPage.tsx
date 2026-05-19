import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader, Eye, EyeOff } from 'lucide-react';
import Swal from 'sweetalert2';
import logo from '../images/logo.png';

export default function LoginPage() {
  const { signInWithEmail, agent, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Afficher sweet alert de succès quand l'utilisateur est connecté
  useEffect(() => {
    if (agent) {
      Swal.fire({
        icon: 'success',
        title: 'Connexion réussie!',
        text: `Bienvenue ${agent.Nom}!`,
        confirmButtonColor: '#0ea5e9',
        timer: 2000,
        timerProgressBar: true,
        backdrop: true,
      });
    }
  }, [agent]);

  // Afficher sweet alert d'erreur depuis le contexte
  useEffect(() => {
    if (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur de connexion',
        text: error,
        confirmButtonColor: '#3b82f6',
        backdrop: true,
      });
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      Swal.fire({
        icon: 'warning',
        title: 'Email requis',
        text: 'Veuillez entrer votre email',
        confirmButtonColor: '#3b82f6',
        backdrop: true,
      });
      return;
    }

    if (!password) {
      Swal.fire({
        icon: 'warning',
        title: 'Mot de passe requis',
        text: 'Veuillez entrer votre mot de passe',
        confirmButtonColor: '#3b82f6',
        backdrop: true,
      });
      return;
    }

    setIsSigningIn(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de la connexion',
        confirmButtonColor: '#3b82f6',
        backdrop: true,
      });
      console.error('Sign in error:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Fond futuriste avec gradient bleu */}
      <div className="absolute inset-0" style={{ backgroundColor: '#1a2436' }}>
        {/* Blobs animés - Bleu */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255,255,255,.05) 25%, rgba(255,255,255,.05) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.05) 75%, rgba(255,255,255,.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255,255,255,.05) 25%, rgba(255,255,255,.05) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.05) 75%, rgba(255,255,255,.05) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Login Modal */}
      <div className="relative h-screen flex items-center justify-center z-10 px-4">
        <div className="w-full max-w-md">
          {/* Glassmorphism card */}
          <div className="relative backdrop-blur-xl bg-white bg-opacity-10 border border-white border-opacity-20 rounded-2xl p-8 shadow-2xl">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-lg opacity-0 group-hover:opacity-20 transition duration-300 -z-10"></div>

            {/* Logo - Très gros et visible */}
            <div className="flex justify-center mb-0">
              <div className="relative">
                <img src={logo} alt="Shipping GL Logo" className="relative w-90 h-90 object-contain" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                PMD
              </h1>
              <p className="text-gray-300 text-sm tracking-widest uppercase">
                Payable Management Dashboard
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-2.5 tracking-wide">
                  EMAIL
                </label>
                <div className="relative group">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@domaine.com"
                    className="w-full px-4 py-3 bg-white bg-opacity-5 border border-white border-opacity-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400 backdrop-blur transition"
                    disabled={isSigningIn}
                  />
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-focus-within:opacity-10 transition -z-10"></div>
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-2.5 tracking-wide">
                  MOT DE PASSE
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white bg-opacity-5 border border-white border-opacity-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400 backdrop-blur transition pr-12"
                    disabled={isSigningIn}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                    disabled={isSigningIn}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-focus-within:opacity-10 transition -z-10"></div>
                </div>
                <p className="text-xs text-gray-400 mt-2">Requis pour accéder au système</p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSigningIn || !email}
                className="w-full mt-8 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider text-sm"
              >
                {isSigningIn ? (
                  <>
                    <Loader className="animate-spin" size={16} />
                    Connexion...
                  </>
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>

            {/* Footer Info */}
            <p className="text-xs text-gray-400 text-center mt-6 tracking-wide">
              © 2026 Shipping GL - Tous droits réservés
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
