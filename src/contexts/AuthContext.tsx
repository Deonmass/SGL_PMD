import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../services/supabase';
import { Agent } from '../types';

interface AuthContextType {
  agent: Agent | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialiser l'agent à partir du localStorage au montage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Charger depuis localStorage
        const storedAgent = localStorage.getItem('auth_agent');
        if (storedAgent) {
          const parsedAgent = JSON.parse(storedAgent);
          setAgent(parsedAgent);
          console.log('✓ Agent restauré depuis localStorage:', parsedAgent.Nom);
        }
      } catch (err) {
        console.error('❌ Erreur lors du chargement de la session:', err);
        localStorage.removeItem('auth_agent');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Sauvegarder agent dans localStorage chaque fois qu'il change
  useEffect(() => {
    if (agent) {
      localStorage.setItem('auth_agent', JSON.stringify(agent));
    }
  }, [agent]);

  // Authentification avec email et vérification du mot de passe haché
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('AGENTS')
        .select('*')
        .eq('email', email)
        .single();

      if (dbError || !data) {
        setError('Email non trouvé dans le système');
        return;
      }

      // Vérifier que l'utilisateur est actif
      if (data.statut !== 'Actif') {
        setError('Cet agent est actuellement inactif');
        return;
      }

      // Vérifier le mot de passe
      if (!password) {
        setError('Le mot de passe est requis');
        return;
      }

      if (!data['mot de passe']) {
        setError('Mot de passe non configuré pour cet agent');
        return;
      }

      // Comparer le mot de passe avec le hash stocké
      const isPasswordValid = await bcrypt.compare(password, data['mot de passe']);

      if (!isPasswordValid) {
        setError('Mot de passe incorrect');
        return;
      }

      // Email et mot de passe corrects - enregistrer l'agent
      const agentData: Agent = {
        ID: data.ID,
        Nom: data.Nom,
        email: data.email,
        Role: data.Role,
        REGION: data.REGION,
        statut: data.statut || 'Actif',
        Mot_de_passe: data['mot de passe'],
        permission: data.permission,
        Date_creation: data.Date_creation,
        Derniere_connexion: data.Derniere_connexion,
      };

      setAgent(agentData);
    } catch (err) {
      console.error('Error signing in:', err);
      setError('Erreur lors de la connexion');
    }
  }, []);

  // Déconnexion
  const signOut = useCallback(async () => {
    setAgent(null);
    localStorage.removeItem('auth_agent');
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ agent, loading, signInWithEmail, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
