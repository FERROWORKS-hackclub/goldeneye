'use client';

import { useEffect, useRef } from 'react';
import { loginToFerroSign } from './actions';

export default function FerroSignLogin() {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    form.current?.requestSubmit();
  }, []);

  return <main className="signin-page">
    <section className="signin-card">
      <div className="brand">FERROSIGN</div>
      <h1>Opening your signing workspace</h1>
      <p>Continue securely with Ferrowork Identity.</p>
      <form action={loginToFerroSign} ref={form}>
        <button className="primary" type="submit">Continue with Ferrowork</button>
      </form>
    </section>
  </main>;
}
