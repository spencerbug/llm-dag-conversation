'use client';

import { SessionProvider } from 'next-auth/react';
import NavBar from '../components/NavBar';

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SessionProvider>
        <NavBar />
        {children}
      </SessionProvider>
    );
  }