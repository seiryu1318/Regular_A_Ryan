import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Home from '../app/page';
import '../app/globals.css';
import admissionsData from '../public/admissions-data.json';

window.__ADMISSIONS_DATA__ = admissionsData;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
