'use client';
import {useEffect} from 'react';
import {signOut} from 'next-auth/react';
export default function LogoutPage(){useEffect(()=>{void signOut({redirectTo:'/'});},[]);return <main className="signin-page"><p>Signing out…</p></main>;}
