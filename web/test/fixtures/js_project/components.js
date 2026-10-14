// Component classes with inheritance and event binding
// NOTE: This is a test fixture for parser testing, not production code
import { formatDate } from './utils.js';

class Component {
  constructor(element) {
    this.element = element;
    this.children = [];
  }

  mount(parent) {
    parent.appendChild(this.element);
    this.onMount();
  }

  onMount() {
    // Override in subclass
  }

  destroy() {
    this.children.forEach(child => child.destroy());
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

class UserCard extends Component {
  constructor(user) {
    super(document.createElement('div'));
    this.user = user;
    this.element.className = 'user-card';
    this.render();
  }

  render() {
    const h3 = document.createElement('h3');
    h3.textContent = this.user.name;
    const p = document.createElement('p');
    p.textContent = formatDate(new Date(this.user.createdAt));
    this.element.appendChild(h3);
    this.element.appendChild(p);
    this.bindEvents();
  }

  bindEvents() {
    const deleteBtn = this.element.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', this.handleDelete);
    }
  }

  handleDelete = (event) => {
    event.stopPropagation();
    this.destroy();
  }

  onMount() {
    this.element.classList.add('mounted');
  }
}

class AdminCard extends UserCard {
  constructor(user) {
    super(user);
    this.element.classList.add('admin');
  }

  render() {
    super.render();
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'Admin';
    this.element.appendChild(badge);
  }
}

export { Component, UserCard, AdminCard };
