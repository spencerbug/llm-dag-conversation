'use client';

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function NavBar() {
  const { data: session } = useSession();

  return (
    <nav style={navStyle}>
      <div style={brandStyle}>
        <Link href="/">DAG LLM App</Link>
      </div>
      <div>
        {session ? (
          <>
            <span style={{ marginRight: "10px" }}>
              Signed in as {session.user?.email}
            </span>
            <button onClick={() => signOut()} style={buttonStyle}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login">
              <button style={buttonStyle}>Login</button>
            </Link>
            <Link href="/register">
              <button style={buttonStyle}>Register</button>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

// Simple inline styles for demonstration
const navStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 20px",
  borderBottom: "1px solid #ccc",
  marginBottom: "20px",
};

const brandStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: "bold",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: "1rem",
  cursor: "pointer",
  marginLeft: "10px",
};