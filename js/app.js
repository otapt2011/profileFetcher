import { loadExistingDB, updateStatusDisplay } from './database.js';
import { setupEventListeners } from './events.js';
import { renderTable, updateButtons } from './renderer.js';

(async () => {
  await loadExistingDB();
  updateStatusDisplay();
  setupEventListeners();
  renderTable();
  updateButtons();
})();