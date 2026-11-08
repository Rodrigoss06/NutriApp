'use client';

import { useEffect, useRef } from 'react';
import { newActionKey, useMeAction } from '@/features/patient-app/records';

/** Al abrir un recurso, la app avisa que lo vio (ADR-086); la API guarda solo la primera vez. Sin interfaz. */
export function MarkViewed({ resourceId }: { resourceId: string }) {
  const view = useMeAction<undefined>(`/me/resources/${resourceId}/view`);
  const { mutate } = view;
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    mutate({ key: newActionKey() });
  }, [mutate]);
  return null;
}
