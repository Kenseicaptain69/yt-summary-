/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import NotebookList from './pages/NotebookList';
import NotebookView from './pages/NotebookView';

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="/notebooks" element={<NotebookList />} />
          <Route path="/notebook/:id" element={<NotebookView />} />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}
