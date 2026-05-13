import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR CONFIG SUPABASE');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓ Configuré' : '✗ MANQUANT');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Configuré' : '✗ MANQUANT');
  console.error('Assurez-vous que votre fichier .env.local contient:');
  console.error('VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.error('VITE_SUPABASE_ANON_KEY=your-anon-key');
  throw new Error('Missing Supabase configuration. Check .env.local file');
}

console.log('✓ Configuration Supabase chargée correctement');

/** URL du projet (pour logs / diagnostics côté client). */
export const SUPABASE_URL = supabaseUrl;

export const supabase = createClient(supabaseUrl, supabaseKey);
