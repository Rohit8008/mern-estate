import { createContext, useContext, useCallback, useReducer } from 'react';

const HISTORY_KEY = 'crm_search_history';
const MAX_HISTORY = 8;

const init = () => ({
  isOpen:   false,
  query:    '',
  entity:   'all',   // active entity tab
  history:  JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'),
});

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true, query: typeof action.query === 'string' ? action.query : '' };
    case 'CLOSE':
      return { ...state, isOpen: false };
    case 'SET_QUERY':
      return { ...state, query: typeof action.query === 'string' ? action.query : '' };
    case 'SET_ENTITY':
      return { ...state, entity: action.entity };
    case 'ADD_HISTORY': {
      const q = (action.query || '').trim();
      if (!q || q.length < 2) return state;
      const next = [q, ...state.history.filter(h => h !== q)].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return { ...state, history: next };
    }
    case 'REMOVE_HISTORY': {
      const next = state.history.filter(h => h !== action.query);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return { ...state, history: next };
    }
    case 'CLEAR_HISTORY': {
      localStorage.removeItem(HISTORY_KEY);
      return { ...state, history: [] };
    }
    default:
      return state;
  }
}

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const open          = useCallback((query = '') => dispatch({ type: 'OPEN', query }), []);
  const close         = useCallback(() => dispatch({ type: 'CLOSE' }), []);
  const setQuery      = useCallback((q)  => dispatch({ type: 'SET_QUERY', query: q }), []);
  const setEntity     = useCallback((e)  => dispatch({ type: 'SET_ENTITY', entity: e }), []);
  const addHistory    = useCallback((q)  => dispatch({ type: 'ADD_HISTORY', query: q }), []);
  const removeHistory = useCallback((q)  => dispatch({ type: 'REMOVE_HISTORY', query: q }), []);
  const clearHistory  = useCallback(()   => dispatch({ type: 'CLEAR_HISTORY' }), []);

  return (
    <SearchContext.Provider value={{ ...state, open, close, setQuery, setEntity, addHistory, removeHistory, clearHistory }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearchContext = () => {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchContext must be used inside <SearchProvider>');
  return ctx;
};
