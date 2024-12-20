// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { Pool } from "pg";
import bcrypt from "bcrypt";

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Define and export authOptions
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "your username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { username, password } = credentials as {
          username: string;
          password: string;
        };

        // Fetch the user from the database
        const userQuery = 'SELECT * FROM users WHERE username = $1';
        const { rows } = await pool.query(userQuery, [username]);

        if (rows.length === 0) {
          // User not found
          return null;
        }

        const user = rows[0];

        // Compare the hashed password
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
          // Invalid password
          return null;
        }

        // Return user object without password
        return { id: user.id, name: user.username, email: user.email };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub; // Add user id to session
      }
      return session;
    },
  },
  debug: process.env.NODE_ENV === "development",
};

// Initialize NextAuth with authOptions
const handler = NextAuth(authOptions);

// Export GET and POST handlers for Next.js API routes
export { handler as GET, handler as POST };