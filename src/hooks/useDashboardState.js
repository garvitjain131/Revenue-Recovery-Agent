'use client';

import { createContext, useContext, useCallback, useReducer } from 'react';

const DashboardContext = createContext(undefined);

const initialState = {
  activeTab: 'overview', // 'overview' | 'inbox'
  filters: { priority: null, status: null, failureType: null, search: '' },
  sorting: { sortBy: 'expected_recovery', order: 'desc' },
  selectedOpportunityId: null,
  isOpportunityModalOpen: false,
  isSettingsPanelOpen: false,
  isKillSwitchModalOpen: false,
  isSidebarOpen: true,

  timeRange: '30d',
  merchantId: 'merchant_rzp_test',
  isLoading: false,
  error: null,
  refreshKey: 0,
};

function getInitialMerchantId() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('ria-merchant-id');
      if (stored && stored !== 'null' && stored !== 'undefined') {
        return stored;
      }
      return 'merchant_rzp_test';
    } catch {
      return 'merchant_rzp_test';
    }
  }
  return 'merchant_rzp_test';
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'RESET_FILTERS':
      return { ...state, filters: { priority: null, status: null, failureType: null, search: '' } };
    case 'SET_SORTING':
      return { ...state, sorting: { sortBy: action.sortBy, order: action.order } };
    case 'SELECT_OPPORTUNITY':
      return { ...state, selectedOpportunityId: action.id, isOpportunityModalOpen: true };
    case 'CLOSE_MODAL':
      return { ...state, isOpportunityModalOpen: false, selectedOpportunityId: null };
    case 'TOGGLE_SETTINGS':
      return { ...state, isSettingsPanelOpen: !state.isSettingsPanelOpen };
    case 'OPEN_KILL_SWITCH_MODAL':
      return { ...state, isKillSwitchModalOpen: true };
    case 'CLOSE_KILL_SWITCH_MODAL':
      return { ...state, isKillSwitchModalOpen: false };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };

    case 'SET_MERCHANT':
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
    case 'TRIGGER_REFRESH':
      return { ...state, refreshKey: state.refreshKey + 1 };
    default:
      return state;
  }
}

export function DashboardStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    merchantId: getInitialMerchantId(),
  });

  const setActiveTab = useCallback((tab) => dispatch({ type: 'SET_ACTIVE_TAB', tab }), []);
  const setFilter = useCallback((key, value) => dispatch({ type: 'SET_FILTER', key, value }), []);
  const resetFilters = useCallback(() => dispatch({ type: 'RESET_FILTERS' }), []);
  const setSorting = useCallback((sortBy, order) => dispatch({ type: 'SET_SORTING', sortBy, order }), []);
  const selectOpportunity = useCallback((id) => dispatch({ type: 'SELECT_OPPORTUNITY', id }), []);
  const closeModal = useCallback(() => dispatch({ type: 'CLOSE_MODAL' }), []);
  const toggleSettings = useCallback(() => dispatch({ type: 'TOGGLE_SETTINGS' }), []);
  const openKillSwitchModal = useCallback(() => dispatch({ type: 'OPEN_KILL_SWITCH_MODAL' }), []);
  const closeKillSwitchModal = useCallback(() => dispatch({ type: 'CLOSE_KILL_SWITCH_MODAL' }), []);
  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);

  const setMerchant = useCallback((id) => dispatch({ type: 'SET_MERCHANT', id }), []);
  const setTimeRange = useCallback((value) => dispatch({ type: 'SET_TIME_RANGE', value }), []);
  const setLoading = useCallback((value) => dispatch({ type: 'SET_LOADING', value }), []);
  const setError = useCallback((error) => dispatch({ type: 'SET_ERROR', error }), []);
  const triggerRefresh = useCallback(() => dispatch({ type: 'TRIGGER_REFRESH' }), []);

  return (
    <DashboardContext.Provider value={{
      state, setActiveTab, setFilter, resetFilters, setSorting, selectOpportunity, closeModal,
      toggleSettings, openKillSwitchModal, closeKillSwitchModal, toggleSidebar,
      setMerchant, setTimeRange, setLoading, setError, triggerRefresh,
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
