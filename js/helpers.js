// js/helpers.js
export const helpers = {
  escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } [m]));
  },
  formatNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n?.toString() || '0';
  },
  sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  },
};