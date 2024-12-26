'use client';

import { SessionProvider } from 'next-auth/react';
import NavBar from '../components/NavBar';

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SessionProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ height: '50px', backgroundColor: 'slategray', color: 'white', padding: '10px' }}>
          <NavBar />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </SessionProvider>
    );
  }