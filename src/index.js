// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter';
import { EventProvider } from './contexts/EventContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <EventProvider>
      <AppRouter />
    </EventProvider>
  </React.StrictMode>
);
