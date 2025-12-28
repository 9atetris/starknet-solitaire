import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import StarknetProvider from './StarknetProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StarknetProvider>
      <App />
    </StarknetProvider>
  </React.StrictMode>
);
