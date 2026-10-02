export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: 'google';
  signedInAt: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  signInWithGoogle: (customUser?: Partial<User>) => void;
  signOut: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: (redirectTarget?: 'simulator' | 'home') => void;
  closeAuthModal: () => void;
}
