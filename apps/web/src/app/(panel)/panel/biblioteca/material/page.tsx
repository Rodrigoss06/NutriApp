import type { Metadata } from 'next';
import { ResourceLibrary } from '@/features/resources/resource-library';

export const metadata: Metadata = { title: 'Material educativo' };

/** Biblioteca › Material educativo (RF-30, ADR-094): enlaces, videos, artículos y PDF de la organización. */
export default function ResourcesPage() {
  return <ResourceLibrary />;
}
