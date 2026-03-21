/**
 * Cache de usuarios para modo real.
 * El UsersProvider lo actualiza al obtener usuarios de la API.
 */

import type { User } from "./types";

let cache: User[] = [];

export function setUsersCache(users: User[]): void {
  cache = users;
}

export function getUsersCache(): User[] {
  return cache;
}
