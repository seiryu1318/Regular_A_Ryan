import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Home from '../app/page';
import '../app/globals.css';
import admissionsData from '../public/admissions-data.json';

window.__ADMISSIONS_DATA__ = {
  ...admissionsData,
  nationalChanges: admissionsData.nationalChanges?.map((row) => {
    const { section } = row;
    if (section !== 'quota' && section !== 'timing' && section !== 'other') {
      throw new Error('Invalid admission change category: ' + section);
    }
    return { ...row, section };
  }),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
