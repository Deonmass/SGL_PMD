import { useEffect, useRef, useState } from 'react';
import {
  CountryOption,
  formatCountryDisplay,
  matchStoredCountry,
  searchCountries,
} from '../../constants/countries';

interface CountryAutocompleteFieldProps {
  value: string;
  onChange: (countryName: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function CountryAutocompleteField({
  value,
  onChange,
  disabled = false,
  label = 'Pays SIGE',
}: CountryAutocompleteFieldProps) {
  const [inputValue, setInputValue] = useState('');
  const [filtered, setFiltered] = useState<CountryOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<CountryOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const match = matchStoredCountry(value);
    if (match) {
      setSelected(match);
      setInputValue(formatCountryDisplay(match));
    } else if (value.trim()) {
      setSelected(null);
      setInputValue(value);
    } else {
      setSelected(null);
      setInputValue('');
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setInputValue(next);
    setSelected(null);
    onChange(next.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim());

    if (next.length > 0) {
      setFiltered(searchCountries(next));
      setShowSuggestions(true);
    } else {
      setFiltered([]);
      setShowSuggestions(false);
      onChange('');
    }
  };

  const selectCountry = (country: CountryOption) => {
    setSelected(country);
    setInputValue(formatCountryDisplay(country));
    onChange(country.name);
    setShowSuggestions(false);
    setFiltered([]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.length > 0) {
              setFiltered(searchCountries(inputValue));
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setShowSuggestions(false), 150);
          }}
          disabled={disabled}
          placeholder="Rechercher un pays…"
          autoComplete="off"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {showSuggestions && filtered.length > 0 && (
          <div className="absolute z-30 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCountry(country)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0 flex items-center gap-2"
              >
                <span className="text-lg leading-none" aria-hidden>
                  {country.flag}
                </span>
                <span className="text-sm font-medium text-gray-900">{country.name}</span>
                <span className="text-xs text-gray-400 ml-auto">{country.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
