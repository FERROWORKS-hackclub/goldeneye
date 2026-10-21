'use client';
import {useEffect} from 'react';
import {SessionProvider,signOut} from 'next-auth/react';
function Logout(){useEffect(()=>{void signOut({redirectTo:'/'});},[]);return <main className="signin-page"><p>Signing out…</p></main>;}
export default function LogoutPage(){return <SessionProvider basePath="/api/login"><Logout/></SessionProvider>;}
