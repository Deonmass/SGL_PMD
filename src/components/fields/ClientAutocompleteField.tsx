import { useEffect, useRef, useState } from 'react';
import { Client, clientService } from '../../services/tableService';
import ClientModal from '../modals/ClientModal';

interface ClientAutocompleteFieldProps {
  value: string;
  onChange: (nom: string) => void;
  onClientSelect?: (client: Client) => void;
  required?: boolean;
}

function clientLabel(client: Client): string {
  return String(client.nom || '').trim();
}

function clientSubtitle(client: Client): string {
  const parts = [client.categorie, client.pays_sige].filter(Boolean);
  return parts.join(' · ');
}

export default function ClientAutocompleteField({
  value,
  onChange,
  onClientSelect,
  required = false,
}: ClientAutocompleteFieldProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadClients = async () => {
      try {
        const data = await clientService.getActive();
        setClients(data);
      } catch (error) {
        console.error('Erreur chargement clients:', error);
      }
    };
    loadClients();
  }, []);

  useEffect(() => {
    if (!value.trim()) {
      setSelectedClient(null);
      return;
    }
    const match = clients.find(
      (c) => clientLabel(c).toLowerCase() === value.trim().toLowerCase(),
    );
    if (match) setSelectedClient(match);
  }, [value, clients]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);
    setSelectedClient(null);

    if (next.length > 0) {
      const q = next.toLowerCase();
      const filtered = clients.filter((client) => {
        const nom = clientLabel(client).toLowerCase();
        const cat = String(client.categorie || '').toLowerCase();
        const pays = String(client.pays_sige || '').toLowerCase();
        return nom.includes(q) || cat.includes(q) || pays.includes(q);
      });
      setFilteredClients(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredClients([]);
      setShowSuggestions(false);
    }
  };

  const selectClient = (client: Client) => {
    const nom = clientLabel(client);
    setSelectedClient(client);
    onChange(nom);
    onClientSelect?.(client);
    setShowSuggestions(false);
    setFilteredClients([]);
  };

  const handleClientSaved = (client: Client) => {
    setClients((prev) => {
      const exists = prev.some((c) => c.id === client.id);
      if (exists) {
        return prev.map((c) => (c.id === client.id ? client : c));
      }
      return [...prev, client].sort((a, b) =>
        clientLabel(a).localeCompare(clientLabel(b), 'fr'),
      );
    });
    selectClient(client);
    setShowAddClientModal(false);
  };

  const showQuickAdd =
    value.trim().length > 0 && filteredClients.length === 0 && !selectedClient;

  return (
    <>
      <div>
        <label className="flex items-center justify-between text-sm font-semibold text-gray-700 mb-2">
          <span>Client{required ? ' *' : ''}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowAddClientModal(true);
            }}
            className="text-blue-600 hover:text-blue-800 text-xs font-semibold underline-offset-2 hover:underline"
          >
            Ajouter
          </button>
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            name="client"
            value={value}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.length > 0) {
                const q = value.toLowerCase();
                const filtered = clients.filter((client) => {
                  const nom = clientLabel(client).toLowerCase();
                  const cat = String(client.categorie || '').toLowerCase();
                  const pays = String(client.pays_sige || '').toLowerCase();
                  return nom.includes(q) || cat.includes(q) || pays.includes(q);
                });
                setFilteredClients(filtered);
                setShowSuggestions(filtered.length > 0);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setShowSuggestions(false), 150);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="off"
            required={required}
          />
          {showQuickAdd && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowAddClientModal(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + Créer
            </button>
          )}
          {showSuggestions && filteredClients.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredClients.map((client) => (
                <button
                  key={client.id ?? clientLabel(client)}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectClient(client)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{clientLabel(client)}</div>
                  {clientSubtitle(client) ? (
                    <div className="text-xs text-gray-500">{clientSubtitle(client)}</div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ClientModal
        isOpen={showAddClientModal}
        initialNom={value.trim()}
        onClose={() => setShowAddClientModal(false)}
        onSave={handleClientSaved}
      />
    </>
  );
}
