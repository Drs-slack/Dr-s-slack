import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { EmergencyProvider } from './lib/emergencies.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <EmergencyProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </EmergencyProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
