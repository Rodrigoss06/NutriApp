'use client';

import { Button } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api/client';

/** Salir: limpia la caché de consultas para no mostrar datos de la sesión anterior. */
export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      router.replace('/entrar');
      router.refresh();
    },
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={logout.isPending}
      onClick={() => {
        logout.mutate();
      }}
    >
      <LogOut aria-hidden />
      Salir
    </Button>
  );
}

/**
 * Sin sesión válida, a /entrar con la ruta actual en ?next=. Se hace en el navegador porque el layout del servidor
 * no conoce la ruta pedida; la protección real la hace la API, que responde 401.
 */
export function RedirectToLogin() {
  const router = useRouter();
  useEffect(() => {
    const next = window.location.pathname + window.location.search;
    router.replace(`/entrar?next=${encodeURIComponent(next)}`);
  }, [router]);
  return <p className="p-6 text-muted-foreground">Tu sesión no es válida. Te llevamos a entrar…</p>;
}
