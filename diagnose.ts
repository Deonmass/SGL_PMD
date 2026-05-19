// Diagnostic script to check database data
import { supabase } from './src/services/supabase';

async function diagnoseData() {
  try {
    console.log('🔍 Diagnostic des données...\n');

    // Check invoices
    const { data: factures, error: facturesError } = await supabase
      .from('FACTURES')
      .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut"')
      .limit(5);

    if (facturesError) {
      console.error('❌ Erreur factures:', facturesError);
    } else {
      console.log('📋 Factures (5 premières):');
      console.table(factures);
    }

    // Check payments
    const { data: paiements, error: paiementsError } = await supabase
      .from('PAIEMENTS')
      .select('*')
      .limit(5);

    if (paiementsError) {
      console.error('❌ Erreur paiements:', paiementsError);
    } else {
      console.log('\n💳 Paiements (5 premiers):');
      console.table(paiements);
    }

    // Get stats
    const { data: allFactures } = await supabase
      .from('FACTURES')
      .select('Montant, "Statut"');

    if (allFactures) {
      const totalMontant = allFactures.reduce((sum: number, f: any) => sum + (parseFloat(f.Montant) || 0), 0);
      const count = allFactures.length;
      console.log(`\n✅ Total factures: ${count}`);
      console.log(`✅ Montant total: ${totalMontant.toFixed(2)}`);
    }

  } catch (err) {
    console.error('Erreur:', err);
  }
}

diagnoseData();
