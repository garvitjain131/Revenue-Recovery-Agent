'use client';

import { createContext, useContext, useCallback, useReducer } from 'react';

const DashboardContext = createContext(undefined);

const initialState = {
  filters: { priority: null, status: null, failureType: null },
  sorting: { sortBy: 'probability', order: 'desc' },
  selectedOpportunityId: null,
  isOpportunityModalOpen: false,
  isSettingsPanelOpen: false,
  timeRange: '30d',
  merchantId: null,
  isLoading: false,
  error: null,
};

// Attempt to restore merchant ID from localStorage on client side
function getInitialMerchantId() {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('ria-merchant-id') || null;
    } catch {
      return null;
    }
  }
  return null;
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'SET_SORTING':
      return { ...state, sorting: { sortBy: action.sortBy, order: action.order } };
    case 'SELECT_OPPORTUNITY':
      return { ...state, selectedOpportunityId: action.id, isOpportunityModalOpen: true };
    case 'CLOSE_MODAL':
      return { ...state, isOpportunityModalOpen: false, selectedOpportunityId: null };
    case 'TOGGLE_SETTINGS':
      return { ...state, isSettingsPanelOpen: !state.isSettingsPanelOpen };
    case 'SET_MERCHANT':
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('ria-merchant-id', action.id); } catch {}
      }
      return { ...state, merchantId: action.id };
    case 'SET_TIME_RANGE':
      return { ...state, timeRange: action.value };
    case 'SET_LOADING':
      return { ...state, isLoading: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function DashboardStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    merchantId: getInitialMerchantId(),
  });

  const setFilter = useCallback((key, value) => dispatch({ type: 'SET_FILTER', key, value }), []);
  const setSorting = useCallback((sortBy, order) => dispatch({ type: 'SET_SORTING', sortBy, order }), []);
  const selectOpportunity = useCallback((id) => dispatch({ type: 'SELECT_OPPORTUNITY', id }), []);
  const closeModal = useCallback(() => dispatch({ type: 'CLOSE_MODAL' }), []);
  const toggleSettings = useCallback(() => dispatch({ type: 'TOGGLE_SETTINGS' }), []);
  const setMerchant = useCallback((id) => dispatch({ type: 'SET_MERCHANT', id }), []);
  const setTimeRange = useCallback((value) => dispatch({ type: 'SET_TIME_RANGE', value }), []);
  const setLoading = useCallback((value) => dispatch({ type: 'SET_LOADING', value }), []);
  const setError = useCallback((error) => dispatch({ type: 'SET_ERROR', error }), []);

  return (
    <DashboardContext.Provider value={{
      state, setFilter, setSorting, selectOpportunity, closeModal,
      toggleSettings, setMerchant, setTimeRange, setLoading, setError,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardState() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboardState must be used within DashboardStateProvider');
  return ctx;
}
