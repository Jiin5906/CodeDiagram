// Utility functions using CommonJS
const EventEmitter = require('events');

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

const logger = {
  info: function(msg) {
    console.log('[INFO]', msg);
  },
  error: function(msg) {
    console.error('[ERROR]', msg);
  }
};

module.exports = { formatDate, debounce, deepClone, validateEmail, logger };
