import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const BuyerViewContext = createContext();

export const useBuyerView = () => {
  const context = useContext(BuyerViewContext);
  if (!context) {
    throw new Error('useBuyerView must be used within a BuyerViewProvider');
  }
  return context;
};

export const BuyerViewProvider = ({ children }) => {
  // Initialize from localStorage or default to false
  const [isBuyerViewMode, setIsBuyerViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('buyerViewMode') === 'true';
    }
    return false;
  });

  // Persist to localStorage whenever the state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('buyerViewMode', isBuyerViewMode.toString());
    }
  }, [isBuyerViewMode]);

  const toggleBuyerViewMode = () => {
    setIsBuyerViewMode((prev) => !prev);
  };

  const value = {
    isBuyerViewMode,
    setIsBuyerViewMode,
    toggleBuyerViewMode,
  };

  return (
    <BuyerViewContext.Provider value={value}>
      {children}
    </BuyerViewContext.Provider>
  );
};

BuyerViewProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
