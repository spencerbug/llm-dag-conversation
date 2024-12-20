// src/app/api/auth/register.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json();

    // Validate input
    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Username, email, and password are required.' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);

    if (userCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'Username or email already exists.' },
        { status: 409 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const insertUser = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email;',
      [username, email, hashedPassword]
    );

    const newUser = insertUser.rows[0];

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error in /api/auth/register:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}