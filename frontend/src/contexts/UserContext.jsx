/* eslint-disable react-refresh/only-export-components -- context file exports its hook and token helper alongside the provider */
import { createContext, useContext, useState } from 'react';

const UserContext = createContext(null);

// Decode the JWT payload (base64url) without a library.
// Returns { user_id, role, name } or null if malformed/expired.
export function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return { user_id: payload.user_id, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

function initialUser() {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  const user = decodeToken(token);
  if (!user) localStorage.removeItem('accessToken');
  return user;
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(initialUser);
  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
