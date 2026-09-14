// TypeScript models with interfaces, types, enums, generics

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface Admin extends User {
  permissions: string[];
  level: number;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export type ApiResponse<T> = {
  data: T;
  status: number;
  message: string;
};

export enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
  Pending = 'PENDING',
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}
