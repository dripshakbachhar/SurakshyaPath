// Initialize Vercel Speed Insights
// This script loads the Speed Insights module and initializes it for the application
(function() {
  'use strict';
  
  // Only run in browser environment
  if (typeof window === 'undefined') return;
  
  // Import and initialize Speed Insights
  import('/js/speed-insights.mjs').then(function(module) {
    // Call injectSpeedInsights to initialize tracking
    module.injectSpeedInsights({
      // Enable debug mode in development
      debug: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
      // Framework identifier
      framework: 'vanilla'
    });
  }).catch(function(error) {
    // Silently fail if module cannot be loaded (e.g., content blockers)
    console.warn('[Speed Insights] Failed to load module:', error.message);
  });
})();
