import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { startEip6963Discovery } from './wallet/eip6963-discovery.js';
import './styles/global.css';

startEip6963Discovery();

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
