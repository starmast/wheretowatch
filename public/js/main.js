/**
 * Main entry point for the NFL Schedule App
 */

import { createNFLApp } from './app.js';

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = createNFLApp();
  app.mount('#app');
});

// Optional: Add global error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});