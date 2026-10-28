import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TimeSourceProvider from './components/TimeSourceProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TimeSourceProvider>
      <App />
    </TimeSourceProvider>
  </StrictMode>,
)
