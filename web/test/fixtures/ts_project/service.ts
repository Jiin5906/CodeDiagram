// TypeScript service with classes, generics, async, decorators
import { User, Admin, ApiResponse, Status, HttpMethod } from './models';

interface Repository<T> {
  findById(id: number): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(item: T): Promise<T>;
  delete(id: number): Promise<void>;
}

class BaseService {
  protected baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  protected async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }
}

class UserService extends BaseService implements Repository<User> {
  constructor() {
    super('/api/users');
  }

  async findById(id: number): Promise<User | null> {
    const result = await this.request<User>(HttpMethod.GET, `/${id}`);
    return result.data;
  }

  async findAll(): Promise<User[]> {
    const result = await this.request<User[]>(HttpMethod.GET, '/');
    return result.data;
  }

  async save(user: User): Promise<User> {
    const result = await this.request<User>(HttpMethod.POST, '/', user);
    return result.data;
  }

  async delete(id: number): Promise<void> {
    await this.request<void>(HttpMethod.DELETE, `/${id}`);
  }

  async findByRole(role: string): Promise<User[]> {
    const result = await this.request<User[]>(HttpMethod.GET, `?role=${role}`);
    return result.data;
  }

  isActive(user: User): boolean {
    return user.role !== 'viewer';
  }
}

function isAdmin(user: User): user is Admin {
  return 'permissions' in user;
}

function createUser(name: string, email: string): User {
  return { id: Date.now(), name, email, role: 'viewer' };
}

const formatUser = (user: User): string => {
  return `${user.name} <${user.email}>`;
};

export { UserService, BaseService, isAdmin, createUser, formatUser };
