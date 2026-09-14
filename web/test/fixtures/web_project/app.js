// Web project JavaScript - DOM manipulation and events
// NOTE: This is a test fixture for parser testing
var API_BASE = '/api';

function initApp() {
  var header = document.getElementById('main-header');
  var navItems = document.querySelectorAll('.nav-item');
  var searchInput = document.querySelector('#search-input');
  var resultsDiv = document.getElementById('results');

  navItems.forEach(function(item) {
    item.addEventListener('click', handleNavClick);
  });

  searchInput.addEventListener('input', handleSearchInput);

  loadInitialData();
}

function handleNavClick(event) {
  var items = document.getElementsByClassName('nav-item');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.remove('active');
  }
  event.currentTarget.classList.add('active');
}

function handleSearchInput(event) {
  var query = event.target.value;
  if (query.length > 2) {
    performSearch(query);
  }
}

async function performSearch(query) {
  var results = document.getElementById('results');
  results.textContent = 'Loading...';

  var response = await fetch(API_BASE + '/search?q=' + query);
  var data = await response.json();
  renderResults(data);
}

function renderResults(data) {
  var container = document.getElementById('results');
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  data.forEach(function(item) {
    var div = document.createElement('div');
    div.className = 'result-item';
    div.textContent = item.title;
    container.appendChild(div);
  });
}

async function loadInitialData() {
  var response = await fetch(API_BASE + '/init');
  var data = await response.json();
  renderResults(data);
}

function setupContactForm() {
  var form = document.getElementById('contact-form');
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    var formData = new FormData(form);
    await submitForm(formData);
  });
}

async function submitForm(formData) {
  var response = await fetch(API_BASE + '/contact', {
    method: 'POST',
    body: formData
  });
  return response.json();
}

document.addEventListener('DOMContentLoaded', initApp);
