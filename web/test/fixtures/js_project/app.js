// Main application entry point
import { formatDate, debounce } from './utils.js';
import { UserCard } from './components.js';

const API_URL = 'https://api.example.com';

class App {
  constructor(rootElement) {
    this.root = rootElement;
    this.users = [];
  }

  async fetchUsers() {
    const response = await fetch(`${API_URL}/users`);
    const data = await response.json();
    this.users = data;
    return data;
  }

  render() {
    this.users.forEach(user => {
      const card = new UserCard(user);
      card.mount(this.root);
    });
  }
}

// Arrow function with DOM access
const initApp = () => {
  const container = document.getElementById('app');
  const header = document.querySelector('.header');
  const app = new App(container);
  app.fetchUsers().then(() => app.render());
};

// Async arrow function
const loadConfig = async () => {
  const res = await fetch('/config.json');
  return res.json();
};

// Regular function with event binding
function setupEvents() {
  const btn = document.getElementById('submit-btn');
  btn.addEventListener('click', handleSubmit);

  const input = document.querySelector('#search-input');
  input.addEventListener('input', debounce(handleSearch, 300));

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', handleNavClick);
  });
}

function handleSubmit(event) {
  event.preventDefault();
  const form = document.getElementById('main-form');
  const data = new FormData(form);
  submitData(data);
}

function handleSearch(event) {
  const query = event.target.value;
  filterResults(query);
}

function handleNavClick(event) {
  const target = event.currentTarget;
  target.classList.add('active');
}

function filterResults(query) {
  console.log('Filtering:', query);
}

function submitData(formData) {
  fetch(API_URL + '/submit', { method: 'POST', body: formData });
}

export { App, initApp, setupEvents };
