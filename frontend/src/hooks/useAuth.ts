import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types/auth';

const STORAGE_KEY = 'traffis_auth_user';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<'simulator' | null>(null);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to sync auth with storage', e);
    }
  }, [user]);

  const signInWithGoogle = useCallback((customUser?: Partial<User>) => {
    const userId = customUser?.id || 'usr_' + Math.random().toString(36).substring(2, 9);
    const userEmail = customUser?.email || '';
    const userName = customUser?.name || (userEmail ? userEmail.split('@')[0] : 'Google User');
    const defaultUser: User = {
      id: userId,
      name: userName,
      email: userEmail,
      avatar: customUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userEmail || userId)}`,
      provider: 'google',
      signedInAt: new Date().toISOString(),
      token: customUser?.token || `dev_${userId}_${Date.now()}`,
    };

    const newUser = { ...defaultUser, ...customUser };
    if (!newUser.token) {
      newUser.token = `dev_${newUser.id}_${Date.now()}`;
    }
    setUser(newUser);
    setIsAuthModalOpen(false);
    return newUser;
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const openAuthModal = useCallback((redirectTarget?: 'simulator' | 'home') => {
    if (redirectTarget === 'simulator') {
      setPendingRedirect('simulator');
    }
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setPendingRedirect(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    signInWithGoogle,
    signOut,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    pendingRedirect,
  };
};
