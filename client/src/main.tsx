import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Play from './pages/Play';
import Screen from './pages/Screen';
import Admin from './pages/Admin';

const path = window.location.pathname.replace(/\/+$/, '');
const Page = path === '/screen' ? Screen : path === '/admin' ? Admin : Play;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
