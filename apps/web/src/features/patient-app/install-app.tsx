'use client';

import { Button, Notice } from '@nutricoach/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE = '(display-mode: standalone)';

function subscribeStandalone(callback: () => void): () => void {
  const media = window.matchMedia(STANDALONE);
  media.addEventListener('change', callback);
  return () => {
    media.removeEventListener('change', callback);
  };
}

/** Si ya abre como app instalada; en el servidor, no. */
const useStandalone = (): boolean =>
  useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(STANDALONE).matches,
    () => false,
  );

/**
 * Instalar la app en el celular (RF-27, 02 §11): en Android y Chrome, con el aviso del navegador; en el iPhone, desde «Compartir».
 * Ya instalada, abre sola en Hoy.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const standalone = useStandalone();
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (installed || standalone) {
    return (
      <Notice tone="success" title="La app está instalada">
        Ábrela desde el ícono de tu pantalla de inicio.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {prompt ? (
        <Button
          size="touch"
          onClick={() => {
            void prompt.prompt();
            void prompt.userChoice.then(() => {
              setPrompt(null);
            });
          }}
        >
          Instalar la app
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground">
        En el iPhone: abre esta página en Safari, toca Compartir y luego «Agregar a inicio». En
        Android, el menú de Chrome tiene «Instalar app».
      </p>
    </div>
  );
}
