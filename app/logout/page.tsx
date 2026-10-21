'use client';
import {useEffect} from 'react';
import {logoutOfFerrowork} from '../actions';
export default function LogoutPage(){useEffect(()=>{void logoutOfFerrowork();},[]);return <main className="signin-page"><p>Signing out…</p></main>;}
